"""Telegram Bot HTTP IO, sender mentions, and HTML sanitization/chunking."""

from __future__ import annotations

import html
import json
import re
import urllib.request
from typing import Any

ALLOWED_HTML_TAGS = {"b", "strong", "i", "em", "code", "pre", "u", "s"}

def tg_api(bot_token: str, method: str, payload: dict[str, Any] | None = None, timeout: int = 35) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{bot_token}/{method}"
    data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_chat_action(bot_token: str, chat_id: str, action: str = "typing") -> None:
    try:
        tg_api(bot_token, "sendChatAction", {"chat_id": chat_id, "action": action}, timeout=5)
    except Exception:
        pass


def set_message_reaction(bot_token: str, chat_id: str, message_id: int | None, emoji: str = "👀") -> None:
    """Best-effort emoji reaction on a user's message so they know Bot #2 received & is processing it."""
    if not bot_token or not chat_id or message_id is None:
        return
    try:
        tg_api(
            bot_token,
            "setMessageReaction",
            {
                "chat_id": chat_id,
                "message_id": message_id,
                "reaction": [{"type": "emoji", "emoji": emoji}],
                "is_big": False,
            },
            timeout=3,
        )
    except Exception:
        pass


def format_sender_mention(msg: dict[str, Any] | None) -> tuple[str, str]:
    """
    Build a safe Telegram HTML @mention / clickable link for the sender plus a plain label.
    Returns ('', 'Admin') for Anonymous Admin posts where Telegram hides the personal user_id.
    """
    if not isinstance(msg, dict):
        return ("", "Admin")
    from_user = msg.get("from") or {}
    from_id = from_user.get("id")
    sender_chat = msg.get("sender_chat") or {}
    chat = msg.get("chat") or {}
    if not from_user or from_id == 1087968824 or (
        sender_chat.get("id") is not None and sender_chat.get("id") == chat.get("id")
    ):
        title = str(sender_chat.get("title") or "Admin").strip()
        return ("", title or "Admin")

    username = str(from_user.get("username") or "").strip().lstrip("@")
    full_name = " ".join(
        part for part in (str(from_user.get("first_name") or "").strip(), str(from_user.get("last_name") or "").strip()) if part
    ).strip() or username or "Bạn"

    if username and re.fullmatch(r"[A-Za-z0-9_]{3,64}", username):
        return (f"@{username}", f"@{username}")
    if isinstance(from_id, int) and from_id > 0:
        return (f'<a href="tg://user?id={from_id}">{html.escape(full_name)}</a>', full_name)
    return ("", full_name)


def sanitize_telegram_html(text: str) -> str:
    """Keep only valid Telegram HTML tags and safe tg://user?id mentions, escaping everything else."""
    tokens: list[str] = []
    pos = 0
    open_anchors = 0
    tag_re = re.compile(r"""<a\s+href=(["'])(tg://user\?id=\d+)\1\s*>|<(/?)([a-zA-Z0-9]+)>""")
    for m in tag_re.finditer(text):
        if m.start() > pos:
            tokens.append(html.escape(text[pos:m.start()], quote=False))
        tg_href = m.group(2)
        if tg_href:
            tokens.append(f'<a href="{tg_href}">')
            open_anchors += 1
        else:
            slash = m.group(3)
            tag = (m.group(4) or "").lower()
            if tag == "a" and slash == "/" and open_anchors > 0:
                tokens.append("</a>")
                open_anchors -= 1
            elif tag in ALLOWED_HTML_TAGS:
                tokens.append(f"<{slash}{tag}>")
            else:
                tokens.append(html.escape(m.group(0), quote=False))
        pos = m.end()
    if pos < len(text):
        tokens.append(html.escape(text[pos:], quote=False))
    while open_anchors > 0:
        tokens.append("</a>")
        open_anchors -= 1
    return "".join(tokens)


def _split_telegram_chunks(text: str, max_len: int = 3900) -> list[str]:
    if len(text) <= max_len:
        return [text]
    chunks: list[str] = []
    remaining = text
    while len(remaining) > max_len:
        cut = remaining.rfind("\n", 0, max_len)
        if cut < max_len // 3:
            cut = max_len
        chunks.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip("\n")
    if remaining:
        chunks.append(remaining)
    return chunks


def send_tg_message(
    bot_token: str,
    chat_id: str,
    text: str,
    reply_to_message_id: int | None = None,
) -> None:
    if not bot_token or not chat_id or not text:
        return
    chunks = _split_telegram_chunks(text)
    for idx, chunk in enumerate(chunks):
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": chunk,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if idx == 0 and reply_to_message_id is not None:
            payload["reply_to_message_id"] = reply_to_message_id
        try:
            tg_api(bot_token, "sendMessage", payload, timeout=10)
        except urllib.error.HTTPError as err:
            if err.code == 400:
                plain = re.sub(r'<a\s+href="tg://user\?id=\d+">|</a>|</?(?:b|strong|code|pre|i|em|u|s)>', "", chunk)
                fallback_payload: dict[str, Any] = {
                    "chat_id": chat_id,
                    "text": plain,
                    "disable_web_page_preview": True,
                }
                if idx == 0 and reply_to_message_id is not None:
                    fallback_payload["reply_to_message_id"] = reply_to_message_id
                tg_api(bot_token, "sendMessage", fallback_payload, timeout=10)
            else:
                raise
