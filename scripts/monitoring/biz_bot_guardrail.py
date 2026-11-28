#!/usr/bin/env python3
"""
3-Layer Zero-Bypass Guardrail for @POS_Lona_bot:
- Layer 1 (Pre-Guardrail, 0 tokens): Blocks prompt injection, jailbreaks, system-prompt
  extraction, technical secret probing, oversized inputs, and purely off-topic requests.
  Allows hybrid questions through so Layer 2 answers ONLY the POS/DB part.
- Layer 3 (Output Anti-Leak Filter): Prevents accidental disclosure of prompt instructions,
  API keys, cryptographic secrets, or off-topic programming code blocks.
"""

from __future__ import annotations

import re

from biz_bot_common import strip_vi

SCOPE_REFUSAL_MSG = (
    "🤖 Tôi chỉ hỗ trợ tra cứu dữ liệu và giải đáp nghiệp vụ trong phạm vi hệ thống POS & Database của Ăn Vặt Tran."
)

MAX_INPUT_CHARS = 1000

INJECTION_OR_SECRET_PATTERNS = (
    re.compile(
        r"\b(?:"
        r"quen het|quen tat ca|quen luat|quen quy tac|bo qua huong dan|bo qua quy tac|"
        r"bo qua gioi han|bo qua luat|vo hieu hoa|vuot rao|"
        r"ignore previous|ignore all instructions|ignore system|disregard above|"
        r"forget previous|override instructions|jailbreak|dan mode|developer mode|sudo mode|bypass"
        r")\b"
    ),
    re.compile(
        r"\b(?:"
        r"system prompt|system instruction|tool declarations|in ra prompt|xem prompt|lo prompt|"
        r"reveal your instructions|print instructions|hien thi huong dan goc|cau hinh noi bo|"
        r"api key|gemini key|bot token|password_hash|password hash|mat khau goc|"
        r"mat khau admin|mat khau dang nhap|bcrypt|vapid private|web_push_vapid_keys|p256dh"
        r")\b"
    ),
    re.compile(
        r"\b(?:"
        r"dong vai|hay gia vo|gia su ban la|act as a|pretend to be|you are now a"
        r")\b"
    ),
)

OFF_TOPIC_PATTERNS = re.compile(
    r"\b(?:"
    r"thoi tiet|nhiet do|du bao mua|xo so|vietlott|lo de|bong da|ty so|"
    r"chung khoan|co phieu|vnindex|crypto|bitcoin|eth|gia vang|ty gia usd|"
    r"viet code|lap trinh|python|javascript|typescript|html|css|java|c\+\+|"
    r"lam tho|viet tho|bai tho|viet van|ke chuyen|truyen cuoi|"
    r"dich sang tieng|translate into|giai toan|phuong trinh|tich phan|"
    r"tu vi|boi toan|chinh tri|bau cu|uong thuoc|chua benh|benh ly"
    r")\b"
)

POS_DOMAIN_CONTEXT_PATTERN = re.compile(
    r"\b(?:"
    r"pos|an vat tran|quan|cua hang|don|hoa don|doanh thu|tien mat|chuyen khoan|"
    r"ket|chot ca|ban|mang ve|mon|thuc don|menu|bep|pha che|combo|cap cay|topping|"
    r"kho|nhap hang|nguyen lieu|nha cung cap|luong|lich truc|ca lam|nhan vien|"
    r"vietqr|qr|khuyen mai|ma giam|voucher|huy|void|audit|nhat ky|"
    r"db|database|du lieu|he thong|may in|rawbt|imin|itp6|invariant|rbac|mdm|"
    r"blind mode|single session|phan he|tai khoan|cau hinh|"
    r"(?:hd|ord)-[a-z0-9-]+"
    r")\b"
)

OUTPUT_LEAK_PATTERNS = re.compile(
    r"(?:"
    r"systeminstruction|tool_declarations|hierarchical instruction|system_map_summary|"
    r"fnb_gemini_api_key|fnb_bot_token|\$2[aby]\$\d{2}\$|aq\.ab8rn6|aiza[0-9a-za-z_-]{15,}|"
    r"begin [a-z ]*private key"
    r")",
    re.I,
)

OUTPUT_CODE_BLOCK_PATTERN = re.compile(
    r"```(?:python|py|javascript|js|typescript|ts|java|cpp|c\+\+|c|go|rust|php|ruby)\b|"
    r"\b(?:def\s+[a-z_][a-z0-9_]*\s*\(|function\s+[a-z_][a-z0-9_]*\s*\()",
    re.I,
)


def check_pre_guardrail(raw_text: str) -> tuple[bool, str | None]:
    """
    Layer 1 fast pre-check before touching Gemini:
    Returns (True, None) when allowed, or (False, refusal_message) when blocked.
    """
    text = (raw_text or "").strip()
    if len(text) > MAX_INPUT_CHARS:
        return False, "⚠️ Câu hỏi quá dài (tối đa 1.000 ký tự). Vui lòng hỏi ngắn gọn trong phạm vi hệ thống POS Ăn Vặt Tran."

    norm = strip_vi(re.sub(r"@pos_lona_bot\b", "", text, flags=re.I))
    if not norm:
        return False, SCOPE_REFUSAL_MSG

    for pat in INJECTION_OR_SECRET_PATTERNS:
        if pat.search(norm):
            return False, SCOPE_REFUSAL_MSG

    # Block purely off-topic requests unless paired with genuine POS/DB terms (hybrid goes to Layer 2)
    if OFF_TOPIC_PATTERNS.search(norm) and not POS_DOMAIN_CONTEXT_PATTERN.search(norm):
        return False, SCOPE_REFUSAL_MSG

    return True, None


def sanitize_ai_output(raw_reply: str) -> tuple[str, bool]:
    """
    Layer 3 output filter:
    Returns (cleaned_reply, is_refusal_or_blocked).
    Never lets prompt leaks, credential hashes, or generic programming code exit to Telegram.
    """
    txt = (raw_reply or "").strip()
    if not txt:
        return SCOPE_REFUSAL_MSG, True

    if OUTPUT_LEAK_PATTERNS.search(txt) or OUTPUT_CODE_BLOCK_PATTERN.search(txt):
        return SCOPE_REFUSAL_MSG, True

    # Normalize stray inline Markdown (**bold**, `code`) to Telegram HTML tags safely
    txt = re.sub(r"\*\*([^\n*]{1,200}?)\*\*", r"<b>\1</b>", txt)
    txt = re.sub(r"`([^\n`]{1,120}?)`", r"<code>\1</code>", txt)

    is_refusal = txt.startswith("🤖 Tôi chỉ hỗ trợ") or "chỉ hỗ trợ tra cứu dữ liệu" in txt.lower()
    return txt, is_refusal
