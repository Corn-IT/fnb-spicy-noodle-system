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

from biz_bot_ai import AiRateLimiter, answer_with_gemini
from biz_bot_common import (
    get_biz_config,
    send_chat_action,
    send_tg_message,
    tg_api,
)
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
        {"command": "hoi", "description": "Hỏi tự do AI Gemini về số liệu quán"},
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


def dispatch_message(
    raw_text: str,
    cfg: dict[str, str],
    rate_limiter: AiRateLimiter,
    is_direct: bool = False,
    typing_cb: Callable[[], None] | None = None,
) -> str | None:
    cmd_parsed = parse_slash_command(raw_text)
    if cmd_parsed is not None:
        cmd, arg = cmd_parsed
        if cmd in COMMAND_HANDLERS:
            if typing_cb:
                typing_cb()
            return COMMAND_HANDLERS[cmd](arg, cfg)
        if cmd == "hoi":
            if not arg:
                return "💡 Gõ theo mẫu: <code>/hoi Hôm nay khung giờ nào bán chạy nhất?</code>"
            if typing_cb:
                typing_cb()
            return answer_with_gemini(arg, cfg=cfg, rate_limiter=rate_limiter)
        # Forward unknown slash commands belonging to Bot #1 gracefully
        if cmd in ("status", "health", "vps", "logs", "errors", "prune", "backup", "restart_api"):
            return (
                f"ℹ️ Lệnh <code>/{html.escape(cmd)}</code> thuộc về <b>Bot Hạ tầng (POS_ServerNoti)</b> tại nhóm Server.\n"
                "Gõ <code>/help</code> để xem 16 lệnh thống kê cửa hàng."
            )
        return None

    if not looks_like_shop_question(raw_text, is_direct=is_direct):
        return None

    fast_match = classify_fast_path(raw_text)
    if fast_match is not None:
        key, arg = fast_match
        handler = COMMAND_HANDLERS.get(key)
        if handler:
            if typing_cb:
                typing_cb()
            return handler(arg, cfg)

    if typing_cb:
        typing_cb()
    return answer_with_gemini(raw_text, cfg=cfg, rate_limiter=rate_limiter)


def main() -> int:
    cfg = get_biz_config()
    bot_token = cfg["bot_token"]
    allowed_chat_id = cfg["chat_id"]
    if not bot_token or not allowed_chat_id:
        print("[biz-bot] Missing FNB_BIZ_BOT_TOKEN or FNB_BIZ_CHAT_ID; exiting cleanly.", file=sys.stderr)
        return 0

    bot_id: int | None = None
    bot_username = "POS_Lona_bot"
    try:
        me = tg_api(bot_token, "getMe", timeout=10).get("result") or {}
        bot_id = me.get("id")
        bot_username = me.get("username") or bot_username
    except Exception as err:
        print(f"[biz-bot] getMe warning: {err}", file=sys.stderr)

    register_biz_commands(bot_token)
    offset = drain_stale_updates(bot_token)
    rate_limiter = AiRateLimiter()
    last_msg_at = 0.0
    print(f"[biz-bot] @{bot_username} listening on chat {allowed_chat_id} (offset={offset})...")

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
                if msg.get("from", {}).get("is_bot"):
                    continue

                chat_id = str(msg.get("chat", {}).get("id", ""))
                if chat_id != allowed_chat_id:
                    continue

                raw_text = msg.get("text") or ""
                if not raw_text.strip():
                    continue

                now = time.monotonic()
                if now - last_msg_at < MIN_MESSAGE_INTERVAL_SEC:
                    continue

                msg_id = msg.get("message_id")
                is_direct = is_direct_message_to_bot(msg, bot_id, bot_username)
                try:
                    reply = dispatch_message(
                        raw_text,
                        cfg=cfg,
                        rate_limiter=rate_limiter,
                        is_direct=is_direct,
                        typing_cb=lambda: send_chat_action(bot_token, chat_id, "typing"),
                    )
                    if reply:
                        last_msg_at = time.monotonic()
                        send_tg_message(bot_token, chat_id, reply, reply_to_message_id=msg_id)
                except Exception as err:
                    print(f"[biz-bot] handler error: {err}", file=sys.stderr)
                    send_tg_message(
                        bot_token,
                        chat_id,
                        f"⚠️ Có lỗi khi xử lý yêu cầu: <code>{html.escape(str(err)[:200])}</code>",
                        reply_to_message_id=msg_id,
                    )
        except Exception as err:
            print(f"[biz-bot] polling loop error: {err}", file=sys.stderr)
            time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
