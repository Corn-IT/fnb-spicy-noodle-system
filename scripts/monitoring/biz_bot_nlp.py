#!/usr/bin/env python3
"""
Layer 1 Vietnamese Natural-Language Fast-Path & Group Chatter Filter for @POS_Lona_bot.
Simple high-frequency shop questions resolve in <0.3s with 0 Gemini quota;
complex comparative/analytical questions fall through to Layer 2 Gemini AI;
casual human chat in groups without direct mention is ignored silently.
"""

from __future__ import annotations

import re

from biz_bot_common import strip_vi

# Specific domain metrics & shop entities (matched on word boundaries to avoid false positives)
STRONG_DOMAIN_PATTERN = re.compile(
    r"\b(?:"
    r"doanh thu|thu nhap|hoa don|don hang|bao nhieu don|may don|tong don|so don|"
    r"ket tien|tien trong ket|tien ket|tien le|chot ca|ket ca|ngan sach|"
    r"vietqr|han muc qr|han muc ngan hang|tai khoan qr|chuyen khoan|tien mat|"
    r"mon ban chay|mon ban cham|top mon|ban chay|ban cham|mon e|thuc don|menu|"
    r"tram bep|bep nau|bep chien|pha che|cap do cay|combo|"
    r"nhap kho|nhap hang|nguyen lieu|nha cung cap|"
    r"khuyen mai|ma giam|ma giam gia|voucher|chiet khau|"
    r"don huy|huy don|huy mon|void|sua thanh toan|"
    r"lich truc|lich lam|ca lam|xep lich|ai truc|"
    r"bang luong|quy luong|luong nhan vien|tien luong|tinh luong|"
    r"loi nhuan|lai lo|lai bao nhieu|loi bao nhieu|"
    r"nhat ky|audit|thong ke|bao cao|tong quan|tinh hinh quan|"
    r"ban dang ngoi|ban co khach|ban trong|bao nhieu ban|may ban|ban nao|mang ve|"
    r"don qr|qr cho|tra sua|mi cay|ga ran|tokbokki|lau|pizza|"
    r"(?:hd|ord)-[a-z0-9-]+"
    r")\b"
)

QUESTION_SIGNAL_PATTERN = re.compile(
    r"(?:\?|\b(?:bao nhieu|may|gi|nao|the nao|nhu nao|sao roi|ra sao|"
    r"ai truc|ai huy|ai chot|ai ban|luc nao|khi nao|cho xem|kiem tra|tra cuu|"
    r"xem|thong ke|bao cao|tong hop|so sanh|tang hay giam|duoc bao|het bao|"
    r"con khong|chua|liet ke|top)\b)"
)

COMPLEX_AI_SIGNALS = (
    "so sanh", "voi ", "tai sao", "vi sao", "phan tich", "xu huong", "khung gio",
    "gio nao", "ngay nao", "dong nhat", "cao diem nhat", "thap nhat", "ai ban",
    "ai huy", "ai chot", "thu ngan nao", "trung binh moi", "ty le", "chi tiet cac",
    "nhom ", "danh muc", "cua ban ", "ban so", "khach goi", "cap do cay",
    "giai thich", "nhan xet", "de xuat", "bao nhieu ly", "may ly", "may phan",
    "bao nhieu phan", "may to", "bao nhieu to", "tra sua", "mi cay", "ga ran",
    "pizza", "tokbokki", "lau ", "mon gi",
)

# Short standalone command-like natural phrases allowed even without "?" or "xem"
SHORT_DIRECT_PHRASE = re.compile(
    r"^(?:doanh thu|ket tien|chot ca|tong quan|bao cao|top mon|mon ban chay|mon ban cham|"
    r"ban dang ngoi|ban co khach|trang thai ban|nhap kho|khuyen mai|don huy|audit|"
    r"lich truc|lich lam|bang luong|loi nhuan|tai khoan qr|han muc qr|vietqr)\b"
)

GREETING_OR_FILLER = {
    "ok", "oke", "okay", "okie", "uh", "uhm", "um", "da", "vang", "rot", "roi",
    "cam on", "thank", "thanks", "tk", "haha", "hihi", "hehe", "huhu", "hi", "hello",
    "alo", "test", "thu", "cham", ".", "..", "...",
}


def looks_like_shop_question(raw_text: str, is_direct: bool = False) -> bool:
    """
    Decide whether an unprompted group message should be processed by Bot #2
    rather than ignored as human chatter.
    """
    norm = strip_vi(raw_text)
    if not norm:
        return False
    if is_direct:
        cleaned = re.sub(r"@pos_lona_bot\b", "", norm).strip()
        return len(cleaned) >= 2

    if norm in GREETING_OR_FILLER or len(norm) < 4:
        return False

    if re.search(r"\b(?:hd|ord)-\d+", norm):
        return True

    has_domain = bool(STRONG_DOMAIN_PATTERN.search(norm))
    if not has_domain:
        return False

    has_question = bool(QUESTION_SIGNAL_PATTERN.search(norm))
    if has_question:
        return True

    if SHORT_DIRECT_PHRASE.search(norm) and len(norm.split()) <= 6:
        return True

    return False


def extract_period_phrase(norm_text: str) -> str:
    """Extract period specifier from normalized Vietnamese text for Fast-Path handlers."""
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
    Attempt deterministic Layer 1 intent match: returns (command_key, arg_str),
    or None if the question is complex/analytical/ambiguous and should go to Gemini AI.
    """
    norm = strip_vi(re.sub(r"@pos_lona_bot\b", "", raw_text, flags=re.I))
    if not norm:
        return None

    m_code = re.search(r"\b((?:HD|ORD)-[A-Z0-9-]+)\b", raw_text, re.I)
    if m_code:
        return ("don", m_code.group(1).upper())

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

    if any(k in norm for k in ("mon ban cham", "ban cham", "ban it", "mon e")):
        return ("topmon", f"cham {period_arg}".strip())

    if any(k in norm for k in ("top mon", "ban chay", "mon nao ban nhieu", "mon hot")):
        return ("topmon", period_arg)

    if any(k in norm for k in ("nhat ky", "audit", "lich su sua")):
        return ("audit", "")

    if any(k in norm for k in ("ban nao", "may ban", "bao nhieu ban", "ban dang", "ban co khach", "ban trong", "qr cho")):
        return ("ban", "")

    if any(k in norm for k in ("bao nhieu don", "may don", "tong don", "so don", "don hang")):
        return ("don", period_arg)

    if any(k in norm for k in ("doanh thu", "ban duoc bao nhieu tien", "thu duoc bao nhieu", "tien ban hang", "chuyen khoan va tien mat")):
        return ("doanhthu", period_arg)

    if any(k in norm for k in ("tong quan", "tinh hinh quan", "bao cao ngay", "tom tat")):
        return ("tongquan", period_arg)

    return None
