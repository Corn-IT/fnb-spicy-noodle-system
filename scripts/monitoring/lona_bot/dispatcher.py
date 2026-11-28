"""Main Telegram Bot #2 long-polling daemon loop."""

from __future__ import annotations

import html
import sys
import time
from typing import Any

from .ai.pool_manager import GeminiApiError
from .bot_commands import COMMAND_HANDLERS, _SLOT_BY_CMD, register_biz_commands  # noqa: F401
from .core.config import get_biz_config
from .core.telegram_io import send_chat_action, send_tg_message, set_message_reaction, tg_api
from .dispatcher_chat import _wrap_reply_text, dispatch_message, dispatch_message_detailed, parse_slash_command  # noqa: F401
from .nlu.invocation import is_reply_to_bot
from .state.entity_cache import EntityCache
from .state.member_directory import TelegramMemberDirectory
from .state.memory import AiRateLimiter, ConversationMemory, plain_snippet
from .state.telemetry import TelemetryStore

MIN_MESSAGE_INTERVAL_SEC = 1.0
GROUP_ANONYMOUS_BOT_ID = 1087968824


def is_human_or_anonymous_admin_message(msg: dict[str, Any], bot_id: int | None) -> bool:
    from_user = msg.get("from") or {}
    from_id = from_user.get("id")
    if bot_id is not None and from_id == bot_id:
        return False
    if not from_user.get("is_bot"):
        return True
    sender_chat = msg.get("sender_chat") or {}
    chat = msg.get("chat") or {}
    if from_id == GROUP_ANONYMOUS_BOT_ID:
        return True
    if sender_chat.get("id") is not None and sender_chat.get("id") == chat.get("id"):
        return True
    return False


def is_direct_message_to_bot(msg: dict[str, Any], bot_id: int | None, bot_username: str) -> bool:
    text_lower = (msg.get("text") or "").lower()
    if bot_username and f"@{bot_username.lower()}" in text_lower:
        return True
    return is_reply_to_bot(msg, bot_id, bot_username)


def extract_reply_context(msg: dict[str, Any]) -> str | None:
    reply = msg.get("reply_to_message")
    if not isinstance(reply, dict):
        return None
    txt = (reply.get("text") or reply.get("caption") or "").strip()
    return plain_snippet(txt, limit=600) if txt else None


def drain_stale_updates(bot_token: str) -> int:
    try:
        resp = tg_api(bot_token, "getUpdates", {"timeout": 0, "allowed_updates": ["message"]}, timeout=10)
        results = resp.get("result", []) if resp.get("ok") else []
        if results:
            return max(int(u.get("update_id", 0)) for u in results) + 1
    except Exception as err:
        print(f"[biz-bot] drain_stale_updates warning: {err}", file=sys.stderr)
    return 0


def main() -> int:
    cfg = get_biz_config()
    bot_token = cfg["bot_token"]
    allowed_chat_id = cfg["chat_id"]
    if not bot_token:
        print("[biz-bot] Missing FNB_BIZ_BOT_TOKEN; exiting cleanly.", file=sys.stderr)
        return 0

    register_biz_commands(bot_token)
    if not allowed_chat_id:
        print("[biz-bot] Registered commands; missing FNB_BIZ_CHAT_ID; exiting cleanly until group chat_id is configured.", file=sys.stderr)
        return 0

    bot_id: int | None = None
    bot_username = "POS_Lona_bot"
    try:
        me = tg_api(bot_token, "getMe", timeout=10).get("result") or {}
        bot_id = me.get("id")
        bot_username = me.get("username") or bot_username
    except Exception as err:
        print(f"[biz-bot] getMe warning: {err}", file=sys.stderr)

    offset = drain_stale_updates(bot_token)
    rate_limiter = AiRateLimiter()
    memory = ConversationMemory(persist_path=cfg.get("memory_file"))
    telemetry = TelemetryStore(stats_path=cfg.get("token_stats_file"), qa_log_path=cfg.get("qa_log_file"))
    member_dir = TelegramMemberDirectory(persist_path=cfg.get("member_cache_file"))
    member_dir.refresh_admins(bot_token, allowed_chat_id, force=True)
    entity_cache = EntityCache()
    last_msg_at = 0.0
    print(f"[biz-bot] @{bot_username} listening on chat {allowed_chat_id} (offset={offset})...", flush=True)

    while True:
        try:
            updates_resp = tg_api(
                bot_token,
                "getUpdates",
                {"offset": offset, "timeout": 25, "allowed_updates": ["message"]},
                timeout=35,
            )
            if not updates_resp.get("ok"):
                time.sleep(3)
                continue

            for update in updates_resp.get("result", []):
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                msg = update.get("message")
                if not isinstance(msg, dict):
                    continue

                chat_id = str(msg.get("chat", {}).get("id", ""))
                raw_text = msg.get("text") or ""
                if chat_id != allowed_chat_id:
                    continue
                if not is_human_or_anonymous_admin_message(msg, bot_id):
                    continue

                member_dir.refresh_admins(bot_token, allowed_chat_id)
                member_dir.observe_message(msg)
                if not raw_text.strip():
                    continue

                now = time.monotonic()
                if now - last_msg_at < MIN_MESSAGE_INTERVAL_SEC:
                    continue

                msg_id = msg.get("message_id")
                is_direct = is_direct_message_to_bot(msg, bot_id, bot_username)
                reply_ctx = extract_reply_context(msg)

                def on_stage(stage: str, _chat_id: str = chat_id, _msg_id: int | None = msg_id) -> None:
                    emoji_map = {"received": "👀", "local": "⚡", "gemini": "🤔", "done": "👍", "refused": "🫡", "error": "😢"}
                    set_message_reaction(bot_token, _chat_id, _msg_id, emoji_map.get(stage, "👀"))
                    if stage in ("local", "gemini"):
                        send_chat_action(bot_token, _chat_id, "typing")

                try:
                    res = dispatch_message_detailed(
                        raw_text,
                        cfg=cfg,
                        rate_limiter=rate_limiter,
                        is_direct=is_direct,
                        status_cb=on_stage,
                        memory=memory,
                        chat_id=chat_id,
                        reply_context=reply_ctx,
                        msg=msg,
                        bot_id=bot_id,
                        bot_username=bot_username,
                        entity_cache=entity_cache,
                        telemetry=telemetry,
                        member_directory=member_dir,
                    )
                    if res and res.get("text"):
                        last_msg_at = time.monotonic()
                        reply_html = str(res["text"])
                        send_tg_message(bot_token, chat_id, reply_html, reply_to_message_id=msg_id)
                        on_stage("refused" if res.get("is_refusal") else "done")
                        usage = res.get("usage") or {}
                        telemetry.record_interaction(
                            question=str(res.get("clean_question") or raw_text),
                            reply=reply_html,
                            route=str(res.get("route") or "local"),
                            sender_label=str(res.get("sender_label") or ""),
                            prompt_tokens=int(usage.get("prompt_tokens") or 0),
                            output_tokens=int(usage.get("output_tokens") or 0),
                            total_tokens=int(usage.get("total_tokens") or 0),
                            is_refusal=bool(res.get("is_refusal")),
                            msg_id=msg_id,
                            raw_q=raw_text,
                            trigger=str(res.get("trigger_mode") or ""),
                            model_used=str(res.get("model_used") or ""),
                            api_requests=int(usage.get("api_requests") or 0),
                            model_requests=usage.get("model_requests") if isinstance(usage.get("model_requests"), dict) else None,
                            model_tokens=usage.get("model_tokens") if isinstance(usage.get("model_tokens"), dict) else None,
                            nlu_miss_candidate=bool(res.get("nlu_miss_candidate")),
                        )
                except GeminiApiError as gerr:
                    telemetry.record_gemini_error(gerr.http_code, gerr.detail)
                    on_stage("error")
                    send_tg_message(
                        bot_token,
                        chat_id,
                        f"⚠️ Gemini API phản hồi lỗi (HTTP {gerr.http_code}): <code>{html.escape(gerr.detail[:180])}</code>\n💡 Kiểm tra chi tiết: <code>/token</code>",
                        reply_to_message_id=msg_id,
                    )
                except Exception as err:
                    on_stage("error")
                    send_tg_message(
                        bot_token,
                        chat_id,
                        f"⚠️ Có lỗi khi xử lý yêu cầu: <code>{html.escape(str(err)[:200])}</code>",
                        reply_to_message_id=msg_id,
                    )
        except Exception as err:
            print(f"[biz-bot] polling loop error: {err}", file=sys.stderr, flush=True)
            time.sleep(5)
