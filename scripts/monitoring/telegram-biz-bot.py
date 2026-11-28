#!/usr/bin/env python3
"""
Interactive Telegram Business Intelligence, Local-First 0-Token & Scoped AI Bot (@POS_Lona_bot).
Supports:
- Strict 4-way invocation gating (Wake-word Lona/Bot/POS Lona/Trợ lý/AI ơi, @POS_Lona_bot, Reply, /commands)
- 3-stage emoji reaction lifecycle (👀 Received -> ⚡ Local / 🤔 Gemini -> 👍 Done / 🫡 Refused / 😢 Error)
- Two-way Telegram @username / clickable mention tagging
- Local-First 0-token focused query engine + persistent structured follow-up memory
- /token telemetry & 7-day rolling Q&A log
"""

from __future__ import annotations

import html
import sys
import time
from typing import Any, Callable

from biz_bot_ai import AiRateLimiter, GeminiApiError, answer_with_gemini_detailed, probe_gemini_status
from biz_bot_common import (
    extract_third_party_mentions,
    format_sender_mention,
    get_biz_config,
    send_chat_action,
    send_tg_message,
    set_message_reaction,
    tg_api,
)
from biz_bot_guardrail import check_pre_guardrail, contains_off_topic_content
from biz_bot_local import EntityCache, try_answer_locally
from biz_bot_nlp import (
    classify_fast_path,
    detect_bot_invocation,
    is_reply_to_bot,
    is_system_doc_question,
    strip_bot_addressing,
)
from biz_bot_queries import (
    handle_audit,
    handle_ban,
    handle_bep,
    handle_doanhthu,
    handle_don,
    handle_help,
    handle_huy,
    handle_ket,
    handle_kho,
    handle_khuyenmai,
    handle_lich,
    handle_loinhuan,
    handle_luong,
    handle_qr,
    handle_tongquan,
    handle_topmon,
)
from biz_bot_state import ConversationMemory, TelemetryStore, extract_slots_from_text, plain_snippet

MIN_MESSAGE_INTERVAL_SEC = 1.0
GROUP_ANONYMOUS_BOT_ID = 1087968824

COMMAND_HANDLERS: dict[str, Callable[[str, dict[str, str]], str]] = {
    "tongquan": lambda arg, cfg: handle_tongquan(arg, cfg=cfg),
    "ban": lambda arg, cfg: handle_ban(cfg=cfg),
    "don": lambda arg, cfg: handle_don(arg, cfg=cfg),
    "doanhthu": lambda arg, cfg: handle_doanhthu(arg, cfg=cfg),
    "ket": lambda arg, cfg: handle_ket(arg, cfg=cfg),
    "qr": lambda arg, cfg: handle_qr(cfg=cfg),
    "topmon": lambda arg, cfg: handle_topmon(arg, cfg=cfg),
    "bep": lambda arg, cfg: handle_bep(arg, cfg=cfg),
    "kho": lambda arg, cfg: handle_kho(arg, cfg=cfg),
    "khuyenmai": lambda arg, cfg: handle_khuyenmai(arg, cfg=cfg),
    "huy": lambda arg, cfg: handle_huy(arg, cfg=cfg),
    "audit": lambda arg, cfg: handle_audit(arg, cfg=cfg),
    "lich": lambda arg, cfg: handle_lich(arg, cfg=cfg),
    "luong": lambda arg, cfg: handle_luong(arg, cfg=cfg),
    "loinhuan": lambda arg, cfg: handle_loinhuan(arg, cfg=cfg),
    "help": lambda arg, cfg: handle_help(cfg=cfg),
    "start": lambda arg, cfg: handle_help(cfg=cfg),
}

_SLOT_BY_CMD: dict[str, str] = {
    "tongquan": "tongquan",
    "don": "don",
    "doanhthu": "doanhthu",
    "ket": "ket",
    "topmon": "topmon_best",
    "bep": "bep",
    "kho": "kho",
    "khuyenmai": "khuyenmai",
    "huy": "huy",
    "lich": "lich",
    "luong": "luong",
    "loinhuan": "loinhuan",
}


def register_biz_commands(bot_token: str) -> None:
    commands = [
        {"command": "tongquan", "description": "Tổng quan doanh thu, két, kho, bàn & lợi nhuận"},
        {"command": "ban", "description": "Bàn đang phục vụ, tạm tính & đơn QR chờ duyệt"},
        {"command": "don", "description": "Thống kê đơn hàng hoặc tra cứu /don <mã_đơn>"},
        {"command": "doanhthu", "description": "Doanh thu, tăng trưởng, PTTT & khung giờ"},
        {"command": "ket", "description": "Đối soát két tiền mặt & lịch sử chốt ca"},
        {"command": "qr", "description": "Hạn mức ngày/tháng/năm tài khoản VietQR"},
        {"command": "topmon", "description": "Top món bán chạy (hoặc /topmon cham)"},
        {"command": "bep", "description": "Sản lượng từng trạm bếp & cấp độ cay"},
        {"command": "kho", "description": "Chi phí nhập kho (Két/Ngoài) & top nguyên liệu"},
        {"command": "khuyenmai", "description": "Hiệu quả mã giảm giá & giảm thủ công"},
        {"command": "huy", "description": "Kiểm soát đơn hủy (VOIDED), hủy món & sửa PTTT"},
        {"command": "audit", "description": "Nhật ký kiểm toán hệ thống gần nhất"},
        {"command": "lich", "description": "Lịch trực nhân viên hôm nay hoặc /lich tuan"},
        {"command": "luong", "description": "Bảng công & quỹ lương ước tính"},
        {"command": "loinhuan", "description": "Lợi nhuận ước tính sau kho & lương"},
        {"command": "token", "description": "Kiểm tra Key/Model Gemini, giờ reset quota & tỷ lệ 0-token"},
        {"command": "gemini", "description": "Check trực tiếp API Key, model & hạn mức Gemini (0 token)"},
        {"command": "hoi", "description": "Hỏi tự do AI Gemini về hệ thống POS & Database"},
        {"command": "quen", "description": "Xóa ngữ cảnh hội thoại gần đây để hỏi chủ đề mới"},
        {"command": "help", "description": "Hướng dẫn 19 lệnh, cách gọi Bot & emoji trạng thái"},
    ]
    for scope in ({"type": "default"}, {"type": "all_group_chats"}):
        try:
            tg_api(bot_token, "setMyCommands", {"commands": commands, "scope": scope}, timeout=10)
        except Exception as err:
            print(f"[biz-bot] setMyCommands ({scope['type']}) warning: {err}", file=sys.stderr)


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
) -> dict[str, Any] | None:
    mem_key = chat_id or str(cfg.get("chat_id", ""))
    history = memory.get_history(mem_key) if memory is not None else []
    slots = memory.get_slots(mem_key) if memory is not None else {}

    if sender_mention is None and msg is not None:
        mention_html, sender_label = format_sender_mention(msg)
    else:
        mention_html = sender_mention or ""
        sender_label = mention_html or "Quản trị viên"

    cc_tags = extract_third_party_mentions(
        raw_text,
        cfg=cfg,
        bot_username=bot_username,
        exclude_handles={mention_html} if mention_html.startswith("@") else None,
    )
    if cc_tags:
        cc_str = " ".join(html.escape(t) for t in cc_tags)
        header_tag = f"{mention_html} → {cc_str}" if mention_html else cc_str
    else:
        header_tag = mention_html

    def emit(stage: str) -> None:
        if status_cb:
            status_cb(stage)
        elif typing_cb and stage == "received":
            typing_cb()

    # Gate 4: Slash Commands
    cmd_parsed = parse_slash_command(raw_text)
    if cmd_parsed is not None:
        cmd, arg = cmd_parsed
        if cmd == "quen":
            emit("received")
            emit("local")
            if memory is not None:
                memory.clear(mem_key)
            body = "🧹 Đã xóa trí nhớ hội thoại gần đây. Bạn có thể hỏi sang chủ đề POS &amp; Database mới nhé!"
            return {
                "text": _wrap_reply_text(body, header_tag, "local"),
                "route": "local",
                "is_refusal": False,
                "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        if cmd in ("token", "gemini"):
            emit("received")
            emit("local")
            store = telemetry or TelemetryStore(
                stats_path=cfg.get("token_stats_file"),
                qa_log_path=cfg.get("qa_log_file"),
            )
            live = probe_gemini_status(cfg, force_refresh=(cmd == "gemini" or "check" in arg.lower()))
            body = store.format_token_report(
                project_name=cfg.get("project_name", "Ăn Vặt Tran"),
                cfg=cfg,
                live_probe=live,
            )
            return {
                "text": _wrap_reply_text(body, header_tag, "command"),
                "route": "command",
                "is_refusal": False,
                "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
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
                "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
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
                    "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                    "trigger_mode": "command",
                    "sender_label": sender_label,
                    "clean_question": raw_text,
                }
            emit("received")
            emit("gemini")
            ai_res = answer_with_gemini_detailed(
                arg,
                cfg=cfg,
                rate_limiter=rate_limiter,
                history=history,
                reply_context=reply_context,
            )
            usage = ai_res.get("usage") or {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0}
            is_ref = bool(ai_res.get("is_refusal"))
            route = "guardrail_block" if (is_ref and usage.get("total_tokens", 0) == 0) else "gemini"
            if memory is not None and not is_ref:
                inferred = extract_slots_from_text(str(ai_res["text"]))
                memory.append_turn(mem_key, arg, str(ai_res["text"]), slots=inferred or None)
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
                "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                "trigger_mode": "command",
                "sender_label": sender_label,
                "clean_question": raw_text,
            }
        return None

    # Gates 1, 2, 3: Wake-word / @POS_Lona_bot / Reply-to-bot
    invoked, trigger_mode, clean_q = detect_bot_invocation(
        raw_text,
        msg=msg,
        bot_id=bot_id,
        bot_username=bot_username,
    )
    if not invoked and is_direct:
        trigger_mode = "mention"
        clean_q = strip_bot_addressing(raw_text, bot_username=bot_username)
        invoked = bool(clean_q)

    if not invoked:
        return None

    # Handle empty bare wake-word ("Lona ơi", "@POS_Lona_bot", "Bot?") cleanly at 0 tokens
    stripped_check = strip_bot_addressing(clean_q, bot_username=bot_username)
    if not clean_q.strip() or (trigger_mode in ("mention", "wake_word") and len(stripped_check.strip("?!., ")) < 2):
        emit("received")
        emit("local")
        body = "👋 Dạ mình nghe đây! Bạn cần tra doanh thu, két tiền, món bán chạy hay cách dùng POS? (Gõ <code>/help</code> để xem nhanh)"
        return {
            "text": _wrap_reply_text(body, header_tag, "local"),
            "route": "local",
            "is_refusal": False,
            "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    emit("received")

    # Layer 1 zero-token guardrail runs FIRST so injections & pure off-topic cannot slip through
    allowed, pre_refusal = check_pre_guardrail(clean_q)
    if not allowed:
        return {
            "text": _wrap_reply_text(str(pre_refusal), header_tag, "guardrail_block"),
            "route": "guardrail_block",
            "is_refusal": True,
            "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    off_topic_tail = (
        "\n\n🤖 <i>Lưu ý: Phần hỏi ngoài phạm vi hệ thống POS &amp; Database tôi xin phép không hỗ trợ.</i>"
        if contains_off_topic_content(clean_q)
        else ""
    )

    # Layer 2A: Local-First 0-token focused engine (superlatives, slices, entity lookup, follow-ups, meta)
    local_res = try_answer_locally(clean_q, cfg=cfg, slots=slots, cache=entity_cache, telemetry=telemetry)
    if local_res is not None:
        emit("local")
        body = str(local_res["text"]) + off_topic_tail
        if memory is not None:
            merged_slots = {**extract_slots_from_text(body), **(local_res.get("slots") or {})}
            memory.append_turn(mem_key, clean_q, body, slots=merged_slots or None)
        return {
            "text": _wrap_reply_text(body, header_tag, "local"),
            "route": str(local_res.get("route") or "local"),
            "is_refusal": False,
            "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "trigger_mode": trigger_mode,
            "sender_label": sender_label,
            "clean_question": clean_q,
        }

    # Layer 2B: Fast-Path 0-token structured reports (/tongquan, /doanhthu, /topmon, ...)
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
                    if key in _SLOT_BY_CMD:
                        fp_slots["intent"] = _SLOT_BY_CMD[key]
                        if arg:
                            fp_slots["period_raw"] = arg
                    memory.append_turn(mem_key, clean_q, body, slots=fp_slots or None)
                return {
                    "text": _wrap_reply_text(body, header_tag, "fast_path"),
                    "route": "fast_path",
                    "is_refusal": False,
                    "usage": {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                    "trigger_mode": trigger_mode,
                    "sender_label": sender_label,
                    "clean_question": clean_q,
                }

    # Layer 3: Gemini AI + 7 Tools + Docs RAG
    emit("gemini")
    ai_res = answer_with_gemini_detailed(
        clean_q,
        cfg=cfg,
        rate_limiter=rate_limiter,
        history=history,
        reply_context=reply_context,
    )
    usage = ai_res.get("usage") or {"prompt_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    is_ref = bool(ai_res.get("is_refusal"))
    route = "guardrail_block" if (is_ref and usage.get("total_tokens", 0) == 0) else "gemini"
    if memory is not None and not is_ref:
        inferred = extract_slots_from_text(str(ai_res["text"]))
        memory.append_turn(mem_key, clean_q, str(ai_res["text"]), slots=inferred or None)
    return {
        "text": _wrap_reply_text(str(ai_res["text"]), header_tag, route, usage.get("total_tokens", 0)),
        "route": route,
        "is_refusal": is_ref,
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
    )
    return str(res["text"]) if res else None


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
    telemetry = TelemetryStore(
        stats_path=cfg.get("token_stats_file"),
        qa_log_path=cfg.get("qa_log_file"),
    )
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
                    print(f"[biz-bot] ignored external chat={chat_id}", flush=True)
                    continue

                if not is_human_or_anonymous_admin_message(msg, bot_id):
                    print(f"[biz-bot] skipped bot sender from_id={msg.get('from', {}).get('id')}", flush=True)
                    continue

                if not raw_text.strip():
                    continue

                now = time.monotonic()
                if now - last_msg_at < MIN_MESSAGE_INTERVAL_SEC:
                    print(f"[biz-bot] throttled rapid message in chat={chat_id}", flush=True)
                    continue

                msg_id = msg.get("message_id")
                is_direct = is_direct_message_to_bot(msg, bot_id, bot_username)
                reply_ctx = extract_reply_context(msg)

                def on_stage(stage: str, _chat_id: str = chat_id, _msg_id: int | None = msg_id) -> None:
                    emoji_map = {
                        "received": "👀",
                        "local": "⚡",
                        "gemini": "🤔",
                        "done": "👍",
                        "refused": "🫡",
                        "error": "😢",
                    }
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
                        )
                        print(
                            f"[biz-bot] replied msg_id={msg_id} route={res.get('route')} trigger={res.get('trigger_mode')} tokens={usage.get('total_tokens', 0)} chars={len(reply_html)}",
                            flush=True,
                        )
                    else:
                        print(f"[biz-bot] ignored un-invoked text={raw_text[:60]!r}", flush=True)
                except GeminiApiError as gerr:
                    telemetry.record_gemini_error(gerr.http_code, gerr.detail)
                    on_stage("error")
                    print(f"[biz-bot] gemini error: {gerr}", file=sys.stderr, flush=True)
                    send_tg_message(
                        bot_token,
                        chat_id,
                        f"⚠️ Gemini API phản hồi lỗi (HTTP {gerr.http_code}): <code>{html.escape(gerr.detail[:180])}</code>\n💡 Kiểm tra chi tiết: <code>/token</code>",
                        reply_to_message_id=msg_id,
                    )
                except Exception as err:
                    on_stage("error")
                    print(f"[biz-bot] handler error: {err}", file=sys.stderr, flush=True)
                    send_tg_message(
                        bot_token,
                        chat_id,
                        f"⚠️ Có lỗi khi xử lý yêu cầu: <code>{html.escape(str(err)[:200])}</code>",
                        reply_to_message_id=msg_id,
                    )
        except Exception as err:
            print(f"[biz-bot] polling loop error: {err}", file=sys.stderr, flush=True)
            time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
