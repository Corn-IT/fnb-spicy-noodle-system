"""Message dispatcher for slash commands, 0-token NLU/fast-paths, and Gemini fallback."""

from __future__ import annotations

import html
from typing import Any, Callable

from .ai.gemini_client import answer_with_gemini_detailed
from .ai.health_probe import probe_gemini_status
from .ai.pool_manager import get_model_runtime_states
from .bot_commands import COMMAND_HANDLERS, _SLOT_BY_CMD
from .core.config import resolve_ai_engine_toggles
from .core.persona import detect_addressing_style, extract_target_honorific, persona_spec
from .core.telegram_io import format_sender_mention
from .core.vi_text import extract_third_party_mentions
from .handlers.local_router import try_answer_locally
from .nlu.guardrail import (
    SCOPE_REFUSAL_MSG,
    check_pre_guardrail,
    contains_off_topic_content,
    format_hybrid_offtopic_tail,
    format_scope_refusal,
)
from .nlu.invocation import (
    _LEADING_VOCATIVE_RE,
    classify_fast_path,
    detect_bot_invocation,
    is_system_doc_question,
    strip_bot_addressing,
)
from .nlu.semantic_engine import match_semantic_intent
from .state.entity_cache import EntityCache
from .state.member_directory import TelegramMemberDirectory
from .state.memory import AiRateLimiter, ConversationMemory, extract_slots_from_text
from .state.telemetry import TelemetryStore


def parse_slash_command(raw_text: str) -> tuple[str, str] | None:
    text = (raw_text or "").strip()
    if not text.startswith("/"):
        return None
    parts = text.split(None, 1)
    head = parts[0].lower().lstrip("/")
    if "@" in head:
        head = head.split("@", 1)[0]
    arg = parts[1].strip() if len(parts) > 1 else ""
    return head, arg


def _wrap_reply_text(
    body_html: str,
    mention_html: str,
    route: str,
    total_tokens: int = 0,
    include_badge: bool = True,
) -> str:
    prefix = f"{mention_html}\n" if mention_html else ""
    if not include_badge:
        return f"{prefix}{body_html}"
    if route == "gemini":
        tok_txt = f"{max(0, int(total_tokens)):,}".replace(",", ".")
        badge = f"<i>🤖 Gemini AI (~{tok_txt} token)</i>" if total_tokens > 0 else "<i>🤖 Gemini AI</i>"
    else:
        badge = "<i>⚡ Cục bộ · 0 token</i>"
    return f"{prefix}{body_html}\n\n{badge}"


def dispatch_message_detailed(
    raw_text: str,
    cfg: dict[str, str],
    rate_limiter: AiRateLimiter,
    is_direct: bool = False,
    typing_cb: Callable[[], None] | None = None,
    status_cb: Callable[[str], None] | None = None,
    memory: ConversationMemory | None = None,
    chat_id: str = "",
    reply_context: str | None = None,
    msg: dict[str, Any] | None = None,
    bot_id: int | None = None,
    bot_username: str = "POS_Lona_bot",
    entity_cache: EntityCache | None = None,
    telemetry: TelemetryStore | None = None,
    sender_mention: str | None = None,
    member_directory: TelegramMemberDirectory | None = None,
) -> dict[str, Any] | None:
    mem_key = chat_id or str(cfg.get("chat_id", ""))
    history = memory.get_history(mem_key) if memory is not None else []
    slots = memory.get_slots(mem_key) if memory is not None else {}

    if sender_mention is None and msg is not None:
        mention_html, sender_label = format_sender_mention(msg)
    else:
        mention_html = sender_mention or ""
        sender_label = mention_html or "Quản trị viên"

    if member_directory is not None and msg is not None:
        member_directory.observe_message(msg)
    exact_aliases, short_aliases = member_directory.build_alias_maps() if member_directory is not None else ({}, {})
    sender_uid = (msg.get("from") or {}).get("id") if isinstance(msg, dict) else None
    exclude_ids = {sender_uid} if isinstance(sender_uid, int) else set()
    if bot_id is not None:
        exclude_ids.add(bot_id)

    cc_tags = extract_third_party_mentions(
        raw_text,
        cfg=cfg,
        bot_username=bot_username,
        exclude_handles={mention_html} if mention_html.startswith("@") else None,
        msg=msg,
        member_aliases=exact_aliases,
        short_member_aliases=short_aliases,
        exclude_user_ids=exclude_ids,
    )
    if cc_tags:
        cc_str = " ".join(t if t.startswith("<a ") else html.escape(t) for t in cc_tags)
        header_tag = f"{mention_html} → {cc_str}" if mention_html else cc_str
    else:
        header_tag = mention_html

    persona_key = detect_addressing_style(raw_text, prev_persona=slots.get("persona"))
    p_spec = persona_spec(persona_key)
    cc_honorific = extract_target_honorific(raw_text)
    toggles = resolve_ai_engine_toggles(cfg)

    def emit(stage: str) -> None:
        if status_cb:
            status_cb(stage)
        elif typing_cb and stage == "received":
            typing_cb()

    zero_usage = {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    # Gate 4: Slash Commands
    cmd_parsed = parse_slash_command(raw_text)
    if cmd_parsed is not None:
        cmd, arg = cmd_parsed
        if cmd == "quen":
            emit("received")
            emit("local")
            if memory is not None:
                memory.clear(mem_key)
            body = (
                f"🧹 Dạ {p_spec['bot']} đã xóa trí nhớ hội thoại gần đây rồi ạ. {p_spec['user'].capitalize()} có thể hỏi sang chủ đề POS &amp; Database mới nhé!"
                if p_spec["bot"] in ("em", "con")
                else "🧹 Mình đã xóa trí nhớ hội thoại gần đây. Bạn có thể hỏi sang chủ đề POS &amp; Database mới nhé!"
            )
            return {
                "text": _wrap_reply_text(body, header_tag, "local"),
                "route": "local",
                "is_refusal": False,
                "usage": dict(zero_usage),
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        if cmd in ("token", "gemini"):
            emit("received")
            emit("local")
            store = telemetry or TelemetryStore(stats_path=cfg.get("token_stats_file"), qa_log_path=cfg.get("qa_log_file"))
            live = probe_gemini_status(cfg, force_refresh=(cmd == "gemini" or "check" in arg.lower()))
            body = store.format_token_report(
                project_name=cfg.get("project_name", "Ăn Vặt Tran"),
                cfg=cfg,
                live_probe=live,
                runtime_states=get_model_runtime_states(),
            )
            return {
                "text": _wrap_reply_text(body, header_tag, "command"),
                "route": "command",
                "is_refusal": False,
                "usage": dict(zero_usage),
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        if cmd in COMMAND_HANDLERS:
            emit("received")
            emit("local")
            res = COMMAND_HANDLERS[cmd](arg, cfg)
            if memory is not None and cmd not in ("help", "start"):
                cmd_slots: dict[str, Any] = dict(extract_slots_from_text(res))
                if cmd in _SLOT_BY_CMD:
                    cmd_slots["intent"] = _SLOT_BY_CMD[cmd]
                    if arg:
                        cmd_slots["period_raw"] = arg
                memory.append_turn(mem_key, raw_text, res, slots=cmd_slots or None)
            return {
                "text": _wrap_reply_text(res, header_tag, "command"),
                "route": "command",
                "is_refusal": False,
                "usage": dict(zero_usage),
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        if cmd == "hoi":
            if not arg:
                return {
                    "text": _wrap_reply_text("💡 Gõ theo mẫu: <code>/hoi Hôm nay khung giờ nào bán chạy nhất?</code>", header_tag, "local"),
                    "route": "local",
                    "is_refusal": True,
                    "usage": dict(zero_usage),
                    "trigger_mode": "command",
                    "sender_label": sender_label,
                    "clean_question": raw_text,
                }
            if not toggles["enabled"] or not toggles["gemini_enabled"]:
                body = "🔕 Nhánh AI Gemini hiện đang tạm tắt trong cấu hình hệ thống."
                return {
                    "text": _wrap_reply_text(body, header_tag, "guardrail_block"),
                    "route": "guardrail_block",
                    "is_refusal": True,
                    "usage": dict(zero_usage),
                    "trigger_mode": "command",
                    "sender_label": sender_label,
                    "clean_question": arg,
                }
            emit("received")
            emit("gemini")
            ai_res = answer_with_gemini_detailed(
                arg, cfg=cfg, rate_limiter=rate_limiter, history=history, reply_context=reply_context, persona_key=persona_key
            )
            usage = ai_res.get("usage") or dict(zero_usage)
            is_ref = bool(ai_res.get("is_refusal"))
            route = "guardrail_block" if (is_ref and usage.get("total_tokens", 0) == 0) else "gemini"
            if memory is not None and not is_ref:
                inferred = {**extract_slots_from_text(str(ai_res["text"])), "persona": persona_key}
                memory.append_turn(mem_key, arg, str(ai_res["text"]), slots=inferred)
            return {
                "text": _wrap_reply_text(str(ai_res["text"]), header_tag, route, usage.get("total_tokens", 0)),
                "route": route,
                "is_refusal": is_ref,
                "usage": usage,
                "model_used": ai_res.get("model_used", ""),
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": arg,
            }
        if cmd in ("status", "health", "vps", "logs", "errors", "prune", "backup", "restart_api"):
            body = (
                f"ℹ️ Lệnh <code>/{html.escape(cmd)}</code> thuộc về <b>Bot Hạ tầng (POS_ServerNoti)</b> tại nhóm Server.\n"
                "Gõ <code>/help</code> để xem các lệnh thống kê cửa hàng."
            )
            return {
                "text": _wrap_reply_text(body, header_tag, "command"),
                "route": "command",
                "is_refusal": False,
                "usage": dict(zero_usage),
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        return None

    # Gates 1, 2, 3: Wake-word / @POS_Lona_bot / Reply-to-bot
    invoked, trigger_mode, clean_q = detect_bot_invocation(raw_text, msg=msg, bot_id=bot_id, bot_username=bot_username)
    if not invoked and is_direct:
        trigger_mode = "mention"
        clean_q = strip_bot_addressing(raw_text, bot_username=bot_username)
        invoked = bool(clean_q)
    if not invoked:
        return None

    stripped_check = _LEADING_VOCATIVE_RE.sub("", clean_q).strip("?!., ")
    if not clean_q.strip() or (
        trigger_mode in ("mention", "wake_word")
        and (len(stripped_check) < 2 or clean_q.strip().lower() in ("lona", "bot", "trợ lý"))
    ):
        emit("received")
        emit("local")
        body = (
            f"👋 Dạ {p_spec['bot']} nghe đây {p_spec['user']}! {p_spec['user'].capitalize()} cần {p_spec['bot']} tra doanh thu, két tiền, món bán chạy hay cách dùng POS ạ? (Gõ <code>/help</code> để xem 20 lệnh nhanh)"
            if p_spec["bot"] in ("em", "con")
            else "👋 Mình nghe đây! Bạn cần tra doanh thu, két tiền, món bán chạy hay cách dùng POS? (Gõ <code>/help</code> để xem nhanh)"
        )
        return {
            "text": _wrap_reply_text(body, header_tag, "local"),
            "route": "local",
            "is_refusal": False,
            "usage": dict(zero_usage),
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    if not toggles["enabled"]:
        emit("received")
        return {
            "text": _wrap_reply_text("🔕 Tính năng <b>Trợ lý AI Lona</b> hiện đang tạm tắt trong cấu hình hệ thống.", header_tag, "guardrail_block"),
            "route": "guardrail_block",
            "is_refusal": True,
            "usage": dict(zero_usage),
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    emit("received")

    allowed, pre_refusal = check_pre_guardrail(clean_q)
    if not allowed:
        refusal_out = pre_refusal if (pre_refusal and pre_refusal != SCOPE_REFUSAL_MSG) else format_scope_refusal(persona_key)
        return {
            "text": _wrap_reply_text(str(refusal_out), header_tag, "guardrail_block"),
            "route": "guardrail_block",
            "is_refusal": True,
            "usage": dict(zero_usage),
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    off_topic_tail = format_hybrid_offtopic_tail(persona_key) if contains_off_topic_content(clean_q) else ""

    if toggles["local_enabled"]:
        local_res = try_answer_locally(
            clean_q,
            cfg=cfg,
            slots=slots,
            cache=entity_cache,
            telemetry=telemetry,
            cc_tags=cc_tags,
            cc_honorific=cc_honorific,
            persona_key=persona_key,
            local_enabled=toggles["local_enabled"],
            allow_kb_fallback=not toggles["gemini_enabled"],
        )
        if local_res is not None:
            emit("local")
            body = str(local_res["text"]) + off_topic_tail
            if memory is not None:
                merged_slots = {**extract_slots_from_text(body), **(local_res.get("slots") or {}), "persona": persona_key}
                memory.append_turn(mem_key, clean_q, body, slots=merged_slots)
            return {
                "text": _wrap_reply_text(body, header_tag, "local"),
                "route": str(local_res.get("route") or "local"),
                "is_refusal": False,
                "usage": dict(zero_usage),
                "trigger_mode": trigger_mode,
                "sender_label": sender_label,
                "clean_question": clean_q,
            }

        if not is_system_doc_question(clean_q):
            fast_match = classify_fast_path(clean_q)
            if fast_match is not None:
                key, arg = fast_match
                handler = COMMAND_HANDLERS.get(key)
                if handler:
                    emit("local")
                    body = handler(arg, cfg) + off_topic_tail
                    if memory is not None:
                        fp_slots: dict[str, Any] = dict(extract_slots_from_text(body))
                        fp_slots["persona"] = persona_key
                        if key in _SLOT_BY_CMD:
                            fp_slots["intent"] = _SLOT_BY_CMD[key]
                            if arg:
                                fp_slots["period_raw"] = arg
                        memory.append_turn(mem_key, clean_q, body, slots=fp_slots)
                    return {
                        "text": _wrap_reply_text(body, header_tag, "fast_path"),
                        "route": "fast_path",
                        "is_refusal": False,
                        "usage": dict(zero_usage),
                        "trigger_mode": trigger_mode,
                        "sender_label": sender_label,
                        "clean_question": clean_q,
                    }

    sem = match_semantic_intent(clean_q, bot_username=bot_username)
    miss_candidate = not sem["guard_blocked"] and not is_system_doc_question(clean_q) and not bool(off_topic_tail)

    if not toggles["gemini_enabled"]:
        emit("local")
        if p_spec["bot"] in ("em", "con"):
            body = f"⚡ Dạ hiện nhánh <b>AI Gemini</b> đang tạm tắt trong cấu hình nên {p_spec['bot']} chỉ trả lời được các câu hỏi cục bộ <b>0 token</b> giúp {p_spec['user']} (gõ <code>/help</code> để xem 20 lệnh nhanh) ạ."
        else:
            body = "⚡ Hiện nhánh <b>AI Gemini</b> đang tạm tắt trong cấu hình nên mình chỉ trả lời được các câu hỏi cục bộ 0 token (gõ <code>/help</code> để xem 20 lệnh nhanh)."
        return {
            "text": _wrap_reply_text(body, header_tag, "local"),
            "route": "local",
            "is_refusal": False,
            "nlu_miss_candidate": miss_candidate,
            "usage": dict(zero_usage),
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    emit("gemini")
    ai_res = answer_with_gemini_detailed(
        clean_q,
        cfg=cfg,
        rate_limiter=rate_limiter,
        history=history,
        reply_context=reply_context,
        persona_key=persona_key,
    )
    usage = ai_res.get("usage") or dict(zero_usage)
    is_ref = bool(ai_res.get("is_refusal"))
    route = "guardrail_block" if (is_ref and usage.get("total_tokens", 0) == 0) else "gemini"
    if memory is not None and not is_ref:
        inferred = {**extract_slots_from_text(str(ai_res["text"])), "persona": persona_key}
        memory.append_turn(mem_key, clean_q, str(ai_res["text"]), slots=inferred)
    return {
        "text": _wrap_reply_text(str(ai_res["text"]), header_tag, route, usage.get("total_tokens", 0)),
        "route": route,
        "is_refusal": is_ref,
        "nlu_miss_candidate": miss_candidate and not is_ref,
        "usage": usage,
        "model_used": ai_res.get("model_used", ""),
        "trigger_mode": trigger_mode,
        "sender_label": sender_label,
        "clean_question": clean_q,
    }


def dispatch_message(
    raw_text: str,
    cfg: dict[str, str],
    rate_limiter: AiRateLimiter,
    is_direct: bool = False,
    typing_cb: Callable[[], None] | None = None,
    status_cb: Callable[[str], None] | None = None,
    memory: ConversationMemory | None = None,
    chat_id: str = "",
    reply_context: str | None = None,
    msg: dict[str, Any] | None = None,
    bot_id: int | None = None,
    bot_username: str = "POS_Lona_bot",
    entity_cache: EntityCache | None = None,
    telemetry: TelemetryStore | None = None,
    sender_mention: str | None = None,
    member_directory: TelegramMemberDirectory | None = None,
) -> str | None:
    res = dispatch_message_detailed(
        raw_text,
        cfg=cfg,
        rate_limiter=rate_limiter,
        is_direct=is_direct,
        typing_cb=typing_cb,
        status_cb=status_cb,
        memory=memory,
        chat_id=chat_id,
        reply_context=reply_context,
        msg=msg,
        bot_id=bot_id,
        bot_username=bot_username,
        entity_cache=entity_cache,
        telemetry=telemetry,
        sender_mention=sender_mention,
        member_directory=member_directory,
    )
    return str(res["text"]) if res else None
