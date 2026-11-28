#!/usr/bin/env python3
"""
Layer 1 Vietnamese Natural-Language Routing & 4-Way Bot Invocation Gating for @POS_Lona_bot.
Bot responds ONLY when addressed via:
1) Explicit wake-word ("Lona", "POS Lona", "Bot", "Trợ lý", "AI ơi") with Unicode diacritic safety
   (so Vietnamese words like "bột" / "bớt" / "bọt" / "ai" never wake the bot accidentally),
2) Direct @POS_Lona_bot mention,
3) Direct Telegram Reply to one of the bot's messages, or
4) Slash commands (/tongquan, /topmon, /token, ...).
Casual owner/manager discussion in the group stays 100% uninterrupted.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from biz_bot_common import strip_vi

# Wake-words matched strictly on NFC lowercase WITH accents intact!
# Avoids Vietnamese homograph collisions: "bột" (\u1ed9) != "bot", "bớt" != "bot", "ai" != "ai ơi".
WAKE_WORD_NFC_RE = re.compile(
    r"(?:^|[\s,;:.!?(\"'«\[])"
    r"(?:(?:pos[\s_-]+)?lona|bot|trợ\s+lý|ai\s+ơi)"
    r"(?=$|[\s,;:.!?)\"'»\]])"
)

# Leading & trailing vocatives stripped before downstream intent matching
_LEADING_VOCATIVE_RE = re.compile(
    r"^\s*(?:(?:hỏi|nhờ|cho\s+hỏi|gọi|này|ê|hey)\s+)?"
    r"(?:@pos_lona_bot|(?:pos[\s_-]+)?lona|trợ\s+lý|ai(?=\s+ơi)|bot(?=\s*(?:ơi|à|ạ|nhé|nha|này|[,:\-–])))"
    r"(?:\s*(?:ơi|à|ạ|nhé|nha|này))?\s*[,:\-–]?\s*",
    re.I,
)
_TRAILING_VOCATIVE_RE = re.compile(
    r"[\s,]*(?:vậy|nhé|nha|thế|hả|hử|ạ|ha)?\s*(?:@pos_lona_bot|(?:pos[\s_-]+)?lona|bot|trợ\s+lý)\s*(?:ơi|à|nhé|ạ)?\s*([?!.]*)\s*$",
    re.I,
)

# Signals forcing Gemini + search_system_docs instead of local 0-token stats
SYSTEM_DOC_SIGNALS = (
    "huong dan", "quy trinh", "hoat dong", "nguyen ly", "co che", "cong thuc",
    "phan he", "tai sao", "vi sao", "do dau", "do sao", "khac gi", "su co", "khac phuc",
    "ket noi", "cau hinh", "may in", "rawbt", "imin", "itp6", "invariant", "bat bien",
    "rbac", "phan quyen", "single session", "blind mode", "mdm", "master data", "delta split",
    "gio tam", "luu tam", "nhap tam", "doi mon", "mon chinh", "bi da", "bi vang",
    "tam tinh", "web push",
)

SYSTEM_META_SELF_SIGNALS = (
    "khong ton token", "ton token", "tiet kiem token", "kiem tra token", "quota", "api key",
    "trang thai gemini", "thong tin gemini", "bao nhieu luot", "may luot", "con hoi duoc",
    "model du phong", "free tier", "gioi han gemini", "biet lam gi", "lam duoc gi",
    "giup duoc gi", "gioi thieu em", "gioi thieu ve",
    "cac cau lenh", "danh sach lenh", "truy cap vao db", "truy cap db", "ket noi db",
    "coding", "viet code",
)

COMPLEX_AI_SIGNALS = (
    "phan tich", "xu huong", "trung binh moi", "chi tiet cac",
    "giai thich", "nhan xet", "de xuat", "cap do cay",
)

FOLLOW_UP_PRONOUN_PATTERN = re.compile(
    r"\b(?:mon do|mon nay|nguoi do|nhan vien do|ban do|don do|cai do|muc do|"
    r"con hom qua|con hom nay|con tuan|con thang|the con|"
    r"chi tiet hon|cu the hon|liet ke them|giai thich them|noi ro hon|ro hon)\b"
)


def is_reply_to_bot(msg: dict[str, Any] | None, bot_id: int | None, bot_username: str) -> bool:
    if not isinstance(msg, dict):
        return False
    reply = msg.get("reply_to_message")
    if not isinstance(reply, dict):
        return False
    from_user = reply.get("from")
    if not isinstance(from_user, dict):
        return False
    if bot_id is not None and from_user.get("id") == bot_id:
        return True
    if bot_username and (from_user.get("username") or "").lower() == bot_username.lower():
        return True
    return False


def strip_bot_addressing(raw_text: str, bot_username: str = "POS_Lona_bot") -> str:
    txt = unicodedata.normalize("NFC", (raw_text or "").strip())
    if bot_username:
        txt = re.sub(rf"@{re.escape(bot_username)}\b", "", txt, flags=re.I).strip()
    txt = re.sub(r"@pos_lona_bot\b", "", txt, flags=re.I).strip()

    # Loop up to 2 passes in case caller wrote "Lona ơi @POS_Lona_bot doanh thu..."
    for _ in range(2):
        prev = txt
        txt = _LEADING_VOCATIVE_RE.sub("", txt).strip()
        if prev == txt:
            break

    def _keep_qmark(m: re.Match[str]) -> str:
        punct = m.group(1) or ""
        return "?" if "?" in punct else ""

    # Preserve subject "bot" in questions like "bot làm gì không tốn token?" (only strip trailing vocative)
    txt = _TRAILING_VOCATIVE_RE.sub(_keep_qmark, txt).strip()
    return txt or unicodedata.normalize("NFC", (raw_text or "").strip())


def detect_bot_invocation(
    raw_text: str,
    msg: dict[str, Any] | None = None,
    bot_id: int | None = None,
    bot_username: str = "POS_Lona_bot",
) -> tuple[bool, str, str]:
    """
    Strictly verify whether the user intended to talk to Bot #2 via one of the 4 gates.
    Returns (invoked, trigger_mode ['none'|'command'|'mention'|'reply'|'wake_word'], clean_question).
    """
    text = unicodedata.normalize("NFC", raw_text or "").strip()
    if not text:
        return False, "none", ""

    if text.startswith("/"):
        return True, "command", text

    lower_nfc = text.lower()
    mention_tag = f"@{bot_username.lower()}" if bot_username else "@pos_lona_bot"
    has_mention = mention_tag in lower_nfc or "@pos_lona_bot" in lower_nfc
    if has_mention:
        return True, "mention", strip_bot_addressing(text, bot_username=bot_username)

    if is_reply_to_bot(msg, bot_id, bot_username):
        return True, "reply", strip_bot_addressing(text, bot_username=bot_username)

    if WAKE_WORD_NFC_RE.search(lower_nfc):
        return True, "wake_word", strip_bot_addressing(text, bot_username=bot_username)

    return False, "none", ""


def is_system_doc_question(raw_text: str) -> bool:
    """True when the question asks about software manual, hardware, RBAC, architecture, or invariants."""
    norm = strip_vi(raw_text)
    if not norm or any(m in norm for m in SYSTEM_META_SELF_SIGNALS):
        return False
    # Treat "cách đây 10 phút" (ago) as time filter, NOT a how-to doc question ("cách kết nối...")
    if re.search(r"\bcach\s+(?!day\b)", norm):
        return True
    return any(sig in norm for sig in SYSTEM_DOC_SIGNALS)


def looks_like_shop_question(
    raw_text: str,
    is_direct: bool = False,
    has_recent_memory: bool = False,
) -> bool:
    """
    Compatibility wrapper preserving the strict 4-way gate:
    Only returns True when invoked via direct mention/reply (is_direct=True), /command, or wake-word.
    """
    if is_direct:
        cleaned = strip_bot_addressing(raw_text)
        return len(cleaned) >= 1
    invoked, _, _ = detect_bot_invocation(raw_text)
    return invoked


def extract_period_phrase(norm_text: str) -> str:
    """Extract period specifier from normalized Vietnamese text for Local & Fast-Path handlers."""
    m_range = re.search(
        r"\d{1,4}[-/]\d{1,2}(?:[-/]\d{1,4})?\s*(?:-|–|->|\.\.|den|toi)\s*\d{1,4}[-/]\d{1,2}(?:[-/]\d{1,4})?",
        norm_text,
    )
    if m_range:
        return m_range.group(0)
    m_month = re.search(r"\b(?:thang\s*)?(\d{1,2})/(\d{4})\b", norm_text)
    if m_month:
        return f"{m_month.group(1)}/{m_month.group(2)}"
    m_date = re.search(r"\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)\b", norm_text)
    if m_date:
        return m_date.group(0)

    for phrase, token in (
        ("hom kia", "homkia"),
        ("hom qua", "homqua"),
        ("hom nay", "homnay"),
        ("tuan truoc", "tuantruoc"),
        ("7 ngay", "7ngay"),
        ("tuan nay", "tuan"),
        ("thang truoc", "thangtruoc"),
        ("thang nay", "thang"),
    ):
        if phrase in norm_text:
            return token
    return ""


def classify_fast_path(raw_text: str) -> tuple[str, str] | None:
    """
    Attempt deterministic report-list/overview match when local targeted engine didn't match first.
    Returns (command_key, arg_str) or None if the question should fall through to Gemini AI.
    """
    norm = strip_vi(strip_bot_addressing(raw_text))
    if not norm:
        return None

    m_code = re.search(r"\b((?:HD|ORD)-[A-Z0-9-]+)\b", raw_text, re.I)
    if m_code:
        return ("don", m_code.group(1).upper())

    if FOLLOW_UP_PRONOUN_PATTERN.search(norm) or is_system_doc_question(raw_text):
        return None

    if any(sig in norm for sig in COMPLEX_AI_SIGNALS):
        return None

    period_arg = extract_period_phrase(norm)

    if any(k in norm for k in ("ket tien", "tien trong ket", "tien ket", "tien le", "chot ca", "ket ca")):
        return ("ket", period_arg)

    if any(k in norm for k in ("tai khoan qr", "han muc qr", "han muc ngan hang", "ngan hang nhan", "vietqr")):
        return ("qr", "")

    if any(k in norm for k in ("don huy", "bi huy", "huy don", "huy mon", "void", "sua thanh toan")):
        return ("huy", period_arg)

    if any(k in norm for k in ("khuyen mai", "ma giam", "voucher", "chiet khau")):
        return ("khuyenmai", period_arg)

    if any(k in norm for k in ("loi nhuan", "lai lo", "loi bao nhieu", "lai bao nhieu")):
        return ("loinhuan", period_arg or "thang")

    if any(k in norm for k in ("bang luong", "quy luong", "luong nhan vien", "tien luong", "tinh luong")):
        return ("luong", period_arg or "thang")

    if any(k in norm for k in ("lich truc", "lich lam", "ai truc", "ca lam", "xep lich")):
        return ("lich", "tuan" if "tuan" in norm else "")

    if any(k in norm for k in ("nhap kho", "nhap hang", "nha cung cap", "tien hang", "tien nhap")):
        return ("kho", period_arg)

    if any(k in norm for k in ("tram bep", "san luong bep", "bep nau", "bep chien", "pha che", "tinh hinh bep")):
        return ("bep", period_arg)

    if any(k in norm for k in ("mon ban cham", "ban cham", "mon e")):
        return ("topmon", f"cham {period_arg}".strip())

    if any(k in norm for k in ("top mon", "top 10", "danh sach mon", "ban chay", "mon hot")):
        return ("topmon", period_arg)

    if any(k in norm for k in ("nhat ky", "audit", "lich su sua")):
        return ("audit", "")

    if any(k in norm for k in ("ban nao", "may ban", "bao nhieu ban", "ban dang", "ban co khach", "ban trong", "qr cho")):
        return ("ban", "")

    if any(k in norm for k in ("bao nhieu don", "may don", "tong don", "so don", "don hang")):
        return ("don", period_arg)

    if any(k in norm for k in ("doanh thu", "ban duoc bao nhieu tien", "thu duoc bao nhieu", "tien ban hang")):
        return ("doanhthu", period_arg)

    if any(k in norm for k in ("tong quan", "tinh hinh quan", "bao cao ngay", "tom tat")):
        return ("tongquan", period_arg)

    return None
