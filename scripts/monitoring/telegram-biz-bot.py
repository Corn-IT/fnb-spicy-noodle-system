#!/usr/bin/env python3
"""
Interactive Telegram Business Statistics & Scoped AI Bot (@POS_Lona_bot) for Ăn Vặt Tran.
Strictly allowlisted to the designated Business Group chat ID, supports 16 read-only
shop statistics commands, Layer 1 Vietnamese Fast-Path NLP, and Layer 2/3 Gemini AI
(strictly scoped to POS data / fnb_bot_ro).
"""

from __future__ import annotations

import html
import re
import sys
import time
from typing import Any, Callable

from biz_bot_ai import AiRateLimiter, answer_with_gemini_detailed
from biz_bot_common import (
    get_biz_config,
    send_chat_action,
    send_tg_message,
    set_message_reaction,
    tg_api,
)
from biz_bot_guardrail import check_pre_guardrail
from biz_bot_nlp import classify_fast_path, looks_like_shop_question
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

MIN_MESSAGE_INTERVAL_SEC = 1.0
MAX_HISTORY_TURNS = 4
HISTORY_TTL_SEC = 600


def _plain_snippet(text: str, limit: int = 500) -> str:
    clean = re.sub(r"<[^>]+>", " ", text or "")
    clean = html.unescape(re.sub(r"\s+", " ", clean)).strip()
    return clean[:limit] if len(clean) <= limit else clean[: limit - 1] + "…"


class ConversationMemory:
    """Short-lived per-chat follow-up context (max 4 turns, 10-minute TTL)."""

    def __init__(
        self,
        max_turns: int = MAX_HISTORY_TURNS,
        ttl_sec: int = HISTORY_TTL_SEC,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_turns = max_turns
        self.ttl_sec = ttl_sec
        self._clock = clock
        self._store: dict[str, tuple[float, list[dict[str, str]]]] = {}

    def get_history(self, chat_id: str) -> list[dict[str, str]]:
        if not chat_id or chat_id not in self._store:
            return []
        ts, turns = self._store[chat_id]
        if self._clock() - ts > self.ttl_sec:
            del self._store[chat_id]
            return []
        return list(turns)

    def append_turn(self, chat_id: str, question: str, answer: str) -> None:
        if not chat_id:
            return
        turns = self.get_history(chat_id)
        turns.append({
            "q": _plain_snippet(question, limit=300),
            "a": _plain_snippet(answer, limit=500),
        })
        if len(turns) > self.max_turns:
            turns = turns[-self.max_turns:]
        self._store[chat_id] = (self._clock(), turns)

    def clear(self, chat_id: str) -> None:
        if chat_id:
            self._store.pop(chat_id, None)

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
        {"command": "hoi", "description": "Hỏi tự do AI Gemini về hệ thống POS & Database"},
        {"command": "quen", "description": "Xóa ngữ cảnh hội thoại gần đây để hỏi chủ đề mới"},
        {"command": "help", "description": "Hướng dẫn toàn bộ lệnh & cách hỏi tự nhiên"},
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


GROUP_ANONYMOUS_BOT_ID = 1087968824


def is_human_or_anonymous_admin_message(msg: dict[str, Any], bot_id: int | None) -> bool:
    from_user = msg.get("from") or {}
    from_id = from_user.get("id")
    if bot_id is not None and from_id == bot_id:
        return False
    if not from_user.get("is_bot"):
        return True
    # Allow Telegram supergroup Anonymous Admin messages (posted as GroupAnonymousBot / sender_chat)
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
    reply = msg.get("reply_to_message")
    if isinstance(reply, dict):
        from_user = reply.get("from")
        if isinstance(from_user, dict):
            if bot_id is not None and from_user.get("id") == bot_id:
                return True
            if bot_username and (from_user.get("username") or "").lower() == bot_username.lower():
                return True
    return False


def drain_stale_updates(bot_token: str) -> int:
    try:
        resp = tg_api(bot_token, "getUpdates", {"timeout": 0, "allowed_updates": ["message"]}, timeout=10)
        results = resp.get("result", []) if resp.get("ok") else []
        if results:
            return max(int(u.get("update_id", 0)) for u in results) + 1
    except Exception as err:
        print(f"[biz-bot] drain_stale_updates warning: {err}", file=sys.stderr)
    return 0


def extract_reply_context(msg: dict[str, Any]) -> str | None:
    reply = msg.get("reply_to_message")
    if not isinstance(reply, dict):
        return None
    txt = (reply.get("text") or reply.get("caption") or "").strip()
    return _plain_snippet(txt, limit=600) if txt else None


def dispatch_message(
    raw_text: str,
    cfg: dict[str, str],
    rate_limiter: AiRateLimiter,
    is_direct: bool = False,
    typing_cb: Callable[[], None] | None = None,
    memory: ConversationMemory | None = None,
    chat_id: str = "",
    reply_context: str | None = None,
) -> str | None:
    mem_key = chat_id or str(cfg.get("chat_id", ""))
    history = memory.get_history(mem_key) if memory is not None else []

    cmd_parsed = parse_slash_command(raw_text)
    if cmd_parsed is not None:
        cmd, arg = cmd_parsed
        if cmd == "quen":
            if typing_cb:
                typing_cb()
            if memory is not None:
                memory.clear(mem_key)
            return "🧹 Đã xóa trí nhớ hội thoại gần đây. Bạn có thể hỏi sang chủ đề POS & Database mới nhé!"
        if cmd in COMMAND_HANDLERS:
            if typing_cb:
                typing_cb()
            res = COMMAND_HANDLERS[cmd](arg, cfg)
            if memory is not None and cmd not in ("help", "start"):
                memory.append_turn(mem_key, raw_text, res)
            return res
        if cmd == "hoi":
            if not arg:
                return "💡 Gõ theo mẫu: <code>/hoi Hôm nay khung giờ nào bán chạy nhất?</code>"
            if typing_cb:
                typing_cb()
            ai_res = answer_with_gemini_detailed(
                arg,
                cfg=cfg,
                rate_limiter=rate_limiter,
                history=history,
                reply_context=reply_context,
            )
            if memory is not None and not ai_res.get("is_refusal"):
                memory.append_turn(mem_key, arg, str(ai_res["text"]))
            return str(ai_res["text"])
        # Forward unknown slash commands belonging to Bot #1 gracefully
        if cmd in ("status", "health", "vps", "logs", "errors", "prune", "backup", "restart_api"):
            return (
                f"ℹ️ Lệnh <code>/{html.escape(cmd)}</code> thuộc về <b>Bot Hạ tầng (POS_ServerNoti)</b> tại nhóm Server.\n"
                "Gõ <code>/help</code> để xem các lệnh thống kê cửa hàng."
            )
        return None

    has_recent = bool(history) or bool(reply_context)
    if not looks_like_shop_question(raw_text, is_direct=is_direct, has_recent_memory=has_recent):
        return None

    # Layer 1 zero-token guardrail runs BEFORE fast-path so mixed injection+domain phrases cannot slip through
    allowed, pre_refusal = check_pre_guardrail(raw_text)
    if not allowed:
        if typing_cb:
            typing_cb()
        return pre_refusal

    fast_match = classify_fast_path(raw_text)
    if fast_match is not None:
        key, arg = fast_match
        handler = COMMAND_HANDLERS.get(key)
        if handler:
            if typing_cb:
                typing_cb()
            res = handler(arg, cfg)
            if memory is not None:
                memory.append_turn(mem_key, raw_text, res)
            return res

    if typing_cb:
        typing_cb()
    ai_res = answer_with_gemini_detailed(
        raw_text,
        cfg=cfg,
        rate_limiter=rate_limiter,
        history=history,
        reply_context=reply_context,
    )
    if memory is not None and not ai_res.get("is_refusal"):
        memory.append_turn(mem_key, raw_text, str(ai_res["text"]))
    return str(ai_res["text"])


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
    memory = ConversationMemory()
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

                def on_accept_processing(_chat_id: str = chat_id, _msg_id: int | None = msg_id) -> None:
                    set_message_reaction(bot_token, _chat_id, _msg_id, "👀")
                    send_chat_action(bot_token, _chat_id, "typing")

                try:
                    reply = dispatch_message(
                        raw_text,
                        cfg=cfg,
                        rate_limiter=rate_limiter,
                        is_direct=is_direct,
                        typing_cb=on_accept_processing,
                        memory=memory,
                        chat_id=chat_id,
                        reply_context=reply_ctx,
                    )
                    if reply:
                        last_msg_at = time.monotonic()
                        send_tg_message(bot_token, chat_id, reply, reply_to_message_id=msg_id)
                        set_message_reaction(bot_token, chat_id, msg_id, "👍")
                        print(f"[biz-bot] replied msg_id={msg_id} chars={len(reply)}", flush=True)
                    else:
                        print(f"[biz-bot] ignored non-query text={raw_text[:60]!r}", flush=True)
                except Exception as err:
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
