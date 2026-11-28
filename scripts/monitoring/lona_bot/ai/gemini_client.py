"""Gemini REST API client with automatic multi-model failover and tool calling."""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ..core.config import (
    canonical_gemini_model,
    get_biz_config,
    get_gemini_pool_specs,
    resolve_gemini_model_pool,
)
from ..core.persona import persona_spec
from ..core.telegram_io import sanitize_telegram_html
from ..core.vi_text import VN_TZ
from ..nlu.guardrail import (
    SCOPE_REFUSAL_MSG,
    check_pre_guardrail,
    format_hybrid_offtopic_tail,
    format_scope_refusal,
    sanitize_ai_output,
)
from ..state.memory import AiRateLimiter
from .health_probe import probe_gemini_status  # noqa: F401
from .pool_manager import (
    GeminiApiError,
    _PROBE_CACHE,
    _mark_model_cooldown,
    _record_model_rpm,
    _scrub_key,
    _select_ordered_models,
)
from .prompt_builder import TOOL_DECLARATIONS, _build_system_instruction, execute_ai_tool

MAX_AI_PER_MINUTE = 28
MAX_TOOL_ROUNDS = 4


def _call_gemini(
    contents: list[dict[str, Any]],
    system_instruction: str,
    cfg: dict[str, str],
) -> dict[str, Any]:
    api_key = cfg.get("gemini_api_key", "").strip()
    if not api_key:
        raise GeminiApiError(0, "Chưa cấu hình FNB_GEMINI_API_KEY")

    payload = json.dumps({
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1200,
        },
    }).encode("utf-8")

    models_to_try = _select_ordered_models(cfg)

    last_err: GeminiApiError | None = None
    for idx, model in enumerate(models_to_try):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        _record_model_rpm(model)
        try:
            with urllib.request.urlopen(req, timeout=18) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                data["_model_used"] = model
                return data
        except urllib.error.HTTPError as err:
            body_err = _scrub_key(err.read().decode("utf-8", "replace")[:260], api_key)
            _mark_model_cooldown(model, int(err.code), body_err)
            last_err = GeminiApiError(int(err.code), f"Gemini HTTP {err.code} ({model}): {body_err}", model=model)
            if err.code in (401, 403) or (err.code == 400 and "API_KEY_INVALID" in body_err):
                raise last_err from err
            if idx + 1 < len(models_to_try):
                continue
            raise last_err from err
        except Exception as err:
            err_msg = _scrub_key(str(err)[:220], api_key)
            _mark_model_cooldown(model, 0, err_msg)
            last_err = GeminiApiError(0, f"Gemini error ({model}): {err_msg}", model=model)
            if idx + 1 < len(models_to_try):
                continue
            raise last_err from err
    assert last_err is not None
    raise last_err


def _extract_model_parts(resp: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    candidates = resp.get("candidates") or []
    if not candidates:
        return [], [], ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    func_calls: list[dict[str, Any]] = []
    texts: list[str] = []
    for part in parts:
        if isinstance(part, dict):
            if "functionCall" in part and isinstance(part["functionCall"], dict):
                func_calls.append(part["functionCall"])
            elif isinstance(part.get("text"), str) and not part.get("thought"):
                texts.append(part["text"])
    return parts, func_calls, "\n".join(texts).strip()


def _build_gemini_contents(
    clean_q: str,
    history: list[dict[str, str]] | None = None,
    reply_context: str | None = None,
) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for turn in (history or [])[-3:]:
        prev_q = (turn.get("q") or "").strip()
        prev_a = (turn.get("a") or "").strip()
        if prev_q and prev_a:
            contents.append({"role": "user", "parts": [{"text": prev_q[:220]}]})
            contents.append({"role": "model", "parts": [{"text": prev_a[:360]}]})

    if reply_context:
        user_payload = (
            "<reply_context>\n"
            f"{reply_context.strip()[:600]}\n"
            "</reply_context>\n\n"
            "<user_question>\n"
            f"{clean_q}\n"
            "</user_question>"
        )
    else:
        user_payload = f"<user_question>\n{clean_q}\n</user_question>"

    contents.append({"role": "user", "parts": [{"text": user_payload}]})
    return contents


def answer_with_gemini_detailed(
    question: str,
    cfg: dict[str, str] | None = None,
    rate_limiter: AiRateLimiter | None = None,
    history: list[dict[str, str]] | None = None,
    reply_context: str | None = None,
    persona_key: str = "minh_ban",
) -> dict[str, Any]:
    empty_usage = {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    cfg = cfg or get_biz_config()
    p = persona_spec(persona_key)
    clean_q = re.sub(r"@pos_lona_bot\b", "", question or "", flags=re.I).strip()
    if not clean_q:
        empty_msg = (
            f"🤖 Dạ {p['user']} nhập câu hỏi liên quan đến hoạt động quán Ăn Vặt Tran giúp em nhé!"
            if p["bot"] == "em"
            else "🤖 Bạn hãy nhập câu hỏi liên quan đến hoạt động quán Ăn Vặt Tran nhé!"
        )
        return {
            "text": empty_msg,
            "is_refusal": True,
            "usage": empty_usage,
        }

    # Layer 1: Zero-token pre-guardrail (prompt injection, secret probing, pure off-topic)
    allowed, pre_refusal = check_pre_guardrail(clean_q)
    if not allowed:
        msg_out = pre_refusal if (pre_refusal and pre_refusal != SCOPE_REFUSAL_MSG) else format_scope_refusal(persona_key)
        return {
            "text": msg_out,
            "is_refusal": True,
            "usage": empty_usage,
        }

    if rate_limiter and not rate_limiter.allow():
        return {
            "text": f"⏳ Nhóm đang hỏi AI hơi dồn dập (tối đa {rate_limiter.max_per_min} câu/phút). Vui lòng thử lại sau ít giây hoặc dùng lệnh <code>/tongquan</code>, <code>/doanhthu</code>...",
            "is_refusal": True,
            "usage": empty_usage,
        }

    sys_inst = _build_system_instruction(persona_key=persona_key)
    contents = _build_gemini_contents(clean_q, history=history, reply_context=reply_context)
    total_prompt = 0
    total_out = 0
    total_tok = 0
    api_requests = 0
    model_requests: dict[str, int] = {}
    model_tokens: dict[str, int] = {}
    model_used = cfg.get("gemini_model", "gemini-3.5-flash-lite")

    for _ in range(MAX_TOOL_ROUNDS):
        resp = _call_gemini(contents, sys_inst, cfg)
        api_requests += 1
        round_model = str(resp.get("_model_used") or model_used)
        model_used = round_model
        um = resp.get("usageMetadata") if isinstance(resp.get("usageMetadata"), dict) else {}
        p_tok = int(um.get("promptTokenCount") or 0)
        o_tok = int(um.get("candidatesTokenCount") or 0)
        t_tok = int(um.get("totalTokenCount") or (p_tok + o_tok))
        total_prompt += p_tok
        total_out += o_tok
        total_tok += t_tok
        canon_m = canonical_gemini_model(round_model)
        model_requests[canon_m] = int(model_requests.get(canon_m, 0)) + 1
        model_tokens[canon_m] = int(model_tokens.get(canon_m, 0)) + max(0, t_tok)
        model_parts, func_calls, text_reply = _extract_model_parts(resp)

        if not func_calls:
            if text_reply:
                # Layer 3: Check output leaks/code fences before Telegram HTML escaping
                filtered, is_refusal = sanitize_ai_output(text_reply, persona_key=persona_key)
                return {
                    "text": sanitize_telegram_html(filtered),
                    "is_refusal": is_refusal,
                    "model_used": model_used,
                    "usage": {
                        "prompt_tokens": total_prompt,
                        "output_tokens": total_out,
                        "total_tokens": total_tok or (total_prompt + total_out),
                        "api_requests": api_requests,
                        "model_requests": model_requests,
                        "model_tokens": model_tokens,
                    },
                }
            break

        contents.append({"role": "model", "parts": model_parts})
        fn_responses = []
        for fc in func_calls:
            fn_name = str(fc.get("name", ""))
            fn_args = fc.get("args") if isinstance(fc.get("args"), dict) else {}
            result = execute_ai_tool(fn_name, fn_args, cfg=cfg)
            fn_responses.append({
                "functionResponse": {
                    "name": fn_name,
                    "response": result,
                }
            })
        contents.append({"role": "user", "parts": fn_responses})

    fail_msg = (
        f"🤖 Dạ xin lỗi {p['user']}, em chưa tổng hợp được câu trả lời cho câu hỏi này. {p['user'].capitalize()} hỏi ngắn gọn hơn hoặc gõ <code>/help</code> giúp em nhé ạ."
        if p["bot"] == "em"
        else "🤖 Xin lỗi bạn, mình chưa tổng hợp được câu trả lời cho câu hỏi này. Bạn hỏi ngắn gọn hơn hoặc dùng <code>/help</code> nhé."
    )
    return {
        "text": fail_msg,
        "is_refusal": True,
        "model_used": model_used,
        "usage": {
            "prompt_tokens": total_prompt,
            "output_tokens": total_out,
            "total_tokens": total_tok or (total_prompt + total_out),
            "api_requests": api_requests,
            "model_requests": model_requests,
            "model_tokens": model_tokens,
        },
    }


def answer_with_gemini(
    question: str,
    cfg: dict[str, str] | None = None,
    rate_limiter: AiRateLimiter | None = None,
    history: list[dict[str, str]] | None = None,
    reply_context: str | None = None,
) -> str:
    return str(
        answer_with_gemini_detailed(
            question,
            cfg=cfg,
            rate_limiter=rate_limiter,
            history=history,
            reply_context=reply_context,
        )["text"]
    )
