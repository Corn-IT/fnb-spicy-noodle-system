"""Natural Vietnamese honorific & addressing style engine."""

from __future__ import annotations

import re
import unicodedata

from .vi_text import strip_vi

PERSONA_PRESETS: dict[str, dict[str, str]] = {
    "minh_ban": {"bot": "mình", "user": "bạn", "polite": "", "end": "nhé"},
    "em_anhchi": {"bot": "em", "user": "anh/chị", "polite": "Dạ ", "end": "ạ"},
    "em_anh": {"bot": "em", "user": "anh", "polite": "Dạ ", "end": "ạ"},
    "em_chi": {"bot": "em", "user": "chị", "polite": "Dạ ", "end": "ạ"},
    "em_sep": {"bot": "em", "user": "sếp", "polite": "Dạ ", "end": "ạ"},
}


def persona_spec(persona_key: str | None = None) -> dict[str, str]:
    return PERSONA_PRESETS.get(persona_key or "minh_ban", PERSONA_PRESETS["minh_ban"])


def detect_addressing_style(raw_text: str, prev_persona: str | None = None) -> str:
    """
    Detect natural Vietnamese addressing pair ('minh_ban' vs 'em_anh'/'em_chi'/'em_sep'/'em_anhchi')
    using NFC tone-safe matching so 'chị' != 'chỉ', 'em' != 'xem/đem/thêm', and self-referential
    staff 'cho em hỏi' does NOT mistakenly force Bot='em'.
    """
    text_nfc = unicodedata.normalize("NFC", raw_text or "").strip().lower()
    if not text_nfc:
        return prev_persona if prev_persona in PERSONA_PRESETS else "minh_ban"

    # Explicit peer tone ("bạn ơi", "giúp mình", "giới thiệu bạn...")
    if re.search(
        r"\b(?:bạn\s+(?:ơi|à|ạ|nhé|nha|có\s+thể|làm\s+được|giúp|biết|trả\s+lời)|của\s+bạn|giới\s+thiệu\s+bạn|nhờ\s+bạn|hỏi\s+bạn|"
        r"mình\s+(?:hỏi|muốn|cần|xem|tra|check)|cho\s+mình|giúp\s+mình|tớ\s+(?:hỏi|muốn|cần)|cậu\s+(?:ơi|biết|giúp))\b",
        text_nfc,
    ):
        return "minh_ban"

    # Junior/staff referring to THEMSELVES as "em" ("cho em hỏi", "em muốn xem", "giúp em tra")
    user_calls_self_em = bool(
        re.search(
            r"\b(?:cho\s+em\s+(?:hỏi|xem|biết|check|xin|tra)|"
            r"em\s+(?:muốn|cần|hỏi|xin|đang\s+xem|không\s+biết)\b|"
            r"(?:giúp|báo|gửi)\s+em\s+(?:xem|tra|tính|check|hỏi|với|cái|nhé|nha))\b",
            text_nfc,
        )
    )

    # Caller explicitly calls themselves anh / chị / sếp talking to Bot -> Bot answers "Dạ em ... anh/chị/sếp ạ"
    if re.search(
        r"\b(?:(?:cho|giúp|báo|gửi)\s+sếp(?:\s|$)|sếp\s+(?:hỏi|xem|nhờ|cần|muốn|check|tra))\b",
        text_nfc,
    ):
        return "em_sep"
    if re.search(
        r"\b(?:(?:cho|giúp|báo|gửi)\s+anh\b(?!\s+[A-ZÀ-Ỹa-zà-ỹ]+\s+vào)|anh\s+(?:hỏi|xem|nhờ|cần|muốn|check|tra))\b",
        text_nfc,
    ):
        return "em_anh"
    if re.search(
        r"\b(?:(?:cho|giúp|báo|gửi)\s+chị\b(?!\s+(?:loan|hương|ngân|xuân|ngọc|hà|trâm|@))|chị\s+(?:hỏi|xem|nhờ|cần|muốn|check|tra))\b",
        text_nfc,
    ):
        return "em_chi"

    # Caller explicitly addresses Bot as "em" ("giới thiệu em", "của em", "em ơi", "em biết", "nhờ em", "em kiểm tra", "lona em")
    bot_called_em = (not user_calls_self_em) and bool(
        re.search(
            r"\b(?:của\s+em|về\s+em|giới\s+thiệu\s+em|em\s+làm\s+được|em\s+biết|em\s+có\s+thể|em\s+ơi|"
            r"lona\s+em|em\s+lona|nhờ\s+em|hỏi\s+em|bảo\s+em|nói\s+với\s+em|"
            r"em\s+(?:giúp|kiểm\s+tra|tra|xem|check|thống\s+kê|trả\s+lời)|"
            r"(?:nhé|nha|đi)\s+em)\b",
            text_nfc,
        )
    )
    if bot_called_em:
        # Preserve specific anh/chi/sep from previous turn if this turn didn't specify which one
        if prev_persona in ("em_anh", "em_chi", "em_sep"):
            return prev_persona
        return "em_anhchi"

    if user_calls_self_em:
        return "minh_ban"

    return prev_persona if prev_persona in PERSONA_PRESETS else "minh_ban"


def extract_target_honorific(raw_text: str) -> str:
    """Extract optional honorific ('chị'/'anh'/'sếp'/'em'/'bạn') right before a tag/name mention."""
    text_nfc = unicodedata.normalize("NFC", raw_text or "").strip().lower()
    m = re.search(
        r"\b(?:tag|nhắc|gọi|mời|báo|gửi|chào|nhờ|cho)\s+(chị|anh|sếp|em|bạn)\s+(?:@|[a-zà-ỹ]{2,})",
        text_nfc,
    )
    if m:
        return m.group(1)
    return ""
