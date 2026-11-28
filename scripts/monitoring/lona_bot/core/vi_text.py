"""Vietnamese text normalization, formatting, period parsing, and third-party mention helpers."""

from __future__ import annotations

import datetime as dt
import html
import re
import unicodedata
from typing import Any

VN_TZ = dt.timezone(dt.timedelta(hours=7))

def vn_now() -> dt.datetime:
    return dt.datetime.now(VN_TZ)


def vn_today_date() -> dt.date:
    return vn_now().date()


def vn_now_str() -> str:
    return vn_now().strftime("%H:%M:%S · %d/%m/%Y")


def strip_vi(text: str) -> str:
    s = (text or "").replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def fmt_vnd(amount: Any) -> str:
    try:
        val = round(float(amount or 0))
    except (TypeError, ValueError):
        val = 0
    return f"{val:,}".replace(",", ".") + "đ"


def fmt_signed_vnd(amount: Any) -> str:
    try:
        val = round(float(amount or 0))
    except (TypeError, ValueError):
        val = 0
    sign = "+" if val > 0 else ""
    return f"{sign}{val:,}".replace(",", ".") + "đ"


def fmt_date_vi(iso_date: str) -> str:
    parts = iso_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return iso_date


def fmt_short_date_vi(iso_date: str) -> str:
    parts = iso_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}"
    return iso_date


def _parse_single_date(token: str, today: dt.date) -> dt.date | None:
    t = token.strip()
    m_iso = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", t)
    if m_iso:
        try:
            return dt.date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            return None
    m_dmy = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", t)
    if m_dmy:
        day = int(m_dmy.group(1))
        month = int(m_dmy.group(2))
        yr_raw = m_dmy.group(3)
        if yr_raw:
            year = int(yr_raw)
            if year < 100:
                year += 2000
        else:
            year = today.year
        try:
            candidate = dt.date(year, month, day)
            if not yr_raw and candidate > today + dt.timedelta(days=2):
                candidate = dt.date(year - 1, month, day)
            return candidate
        except ValueError:
            return None
    return None


def parse_period_spec(raw_spec: str | None = None, today: dt.date | None = None) -> dict[str, str]:
    """
    Parse Vietnamese period token/phrase or date/range into
    {"preset": ..., "fromDate": YYYY-MM-DD, "toDate": YYYY-MM-DD, "label": ...}.
    """
    today = today or vn_today_date()
    norm = strip_vi(raw_spec or "")
    compact = re.sub(r"\s+", "", norm)

    if not norm or compact in ("homnay", "nay", "today", "hn"):
        iso = today.isoformat()
        return {"preset": "today", "fromDate": iso, "toDate": iso, "label": f"Hôm nay ({fmt_short_date_vi(iso)})"}

    if compact in ("homqua", "qua", "yesterday", "hq"):
        d = today - dt.timedelta(days=1)
        iso = d.isoformat()
        return {"preset": "yesterday", "fromDate": iso, "toDate": iso, "label": f"Hôm qua ({fmt_short_date_vi(iso)})"}

    if compact in ("homkia", "kia", "2ngaytruoc", "homtruoc"):
        d = today - dt.timedelta(days=2)
        iso = d.isoformat()
        return {"preset": "custom", "fromDate": iso, "toDate": iso, "label": f"Hôm kia ({fmt_short_date_vi(iso)})"}

    if compact in ("7ngay", "7d", "7ngayqua", "tuanqua"):
        start = today - dt.timedelta(days=6)
        return {
            "preset": "7d",
            "fromDate": start.isoformat(),
            "toDate": today.isoformat(),
            "label": f"7 ngày qua ({fmt_short_date_vi(start.isoformat())}–{fmt_short_date_vi(today.isoformat())})",
        }

    if compact in ("30ngay", "30d", "30ngayqua", "thangqua"):
        start = today - dt.timedelta(days=29)
        return {
            "preset": "custom",
            "fromDate": start.isoformat(),
            "toDate": today.isoformat(),
            "label": f"30 ngày qua ({fmt_short_date_vi(start.isoformat())}–{fmt_short_date_vi(today.isoformat())})",
        }

    if compact in ("nam", "namnay", "trongnam", "canam", "year"):
        start = today.replace(month=1, day=1)
        return {
            "preset": "custom",
            "fromDate": start.isoformat(),
            "toDate": today.isoformat(),
            "label": f"Năm {today.year}",
        }

    if compact in ("tuan", "tuannay"):
        monday = today - dt.timedelta(days=today.weekday())
        return {
            "preset": "custom",
            "fromDate": monday.isoformat(),
            "toDate": today.isoformat(),
            "label": f"Tuần này ({fmt_short_date_vi(monday.isoformat())}–{fmt_short_date_vi(today.isoformat())})",
        }

    if compact in ("tuantruoc",):
        this_mon = today - dt.timedelta(days=today.weekday())
        prev_mon = this_mon - dt.timedelta(days=7)
        prev_sun = this_mon - dt.timedelta(days=1)
        return {
            "preset": "custom",
            "fromDate": prev_mon.isoformat(),
            "toDate": prev_sun.isoformat(),
            "label": f"Tuần trước ({fmt_short_date_vi(prev_mon.isoformat())}–{fmt_short_date_vi(prev_sun.isoformat())})",
        }

    if compact in ("thang", "thangnay", "month"):
        first = today.replace(day=1)
        return {
            "preset": "month",
            "fromDate": first.isoformat(),
            "toDate": today.isoformat(),
            "label": f"Tháng {today.month}/{today.year}",
        }

    if compact in ("thangtruoc",):
        first_this = today.replace(day=1)
        last_prev = first_this - dt.timedelta(days=1)
        first_prev = last_prev.replace(day=1)
        return {
            "preset": "custom",
            "fromDate": first_prev.isoformat(),
            "toDate": last_prev.isoformat(),
            "label": f"Tháng {last_prev.month}/{last_prev.year}",
        }

    # Explicit range dd/mm-dd/mm or YYYY-MM-DD..YYYY-MM-DD
    m_range = re.search(r"(\d{1,4}[-/]\d{1,2}(?:[-/]\d{1,4})?)\s*(?:-|–|->|\.\.|den|toi)\s*(\d{1,4}[-/]\d{1,2}(?:[-/]\d{1,4})?)", norm)
    if m_range:
        d1 = _parse_single_date(m_range.group(1), today)
        d2 = _parse_single_date(m_range.group(2), today)
        if d1 and d2:
            if d1 > d2:
                d1, d2 = d2, d1
            return {
                "preset": "custom",
                "fromDate": d1.isoformat(),
                "toDate": d2.isoformat(),
                "label": f"{fmt_short_date_vi(d1.isoformat())}–{fmt_short_date_vi(d2.isoformat())}",
            }

    # Explicit month/year MM/YYYY
    m_month = re.search(r"\b(\d{1,2})/(\d{4})\b", norm)
    if m_month:
        mm, yy = int(m_month.group(1)), int(m_month.group(2))
        if 1 <= mm <= 12 and 2020 <= yy <= 2099:
            first = dt.date(yy, mm, 1)
            next_first = dt.date(yy + 1, 1, 1) if mm == 12 else dt.date(yy, mm + 1, 1)
            last = min(today, next_first - dt.timedelta(days=1)) if (yy == today.year and mm == today.month) else (next_first - dt.timedelta(days=1))
            if last < first:
                last = next_first - dt.timedelta(days=1)
            return {
                "preset": "custom",
                "fromDate": first.isoformat(),
                "toDate": last.isoformat(),
                "label": f"Tháng {mm}/{yy}",
            }

    # Explicit single date
    m_single = re.search(r"(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)", norm)
    if m_single:
        d = _parse_single_date(m_single.group(1), today)
        if d:
            iso = d.isoformat()
            return {"preset": "custom", "fromDate": iso, "toDate": iso, "label": fmt_date_vi(iso)}

    iso = today.isoformat()
    return {"preset": "today", "fromDate": iso, "toDate": iso, "label": f"Hôm nay ({fmt_short_date_vi(iso)})"}


def extract_third_party_mentions(
    raw_text: str,
    cfg: dict[str, str] | None = None,
    bot_username: str = "POS_Lona_bot",
    exclude_handles: set[str] | None = None,
    msg: dict[str, Any] | None = None,
    member_aliases: dict[str, str] | None = None,
    short_member_aliases: dict[str, str] | None = None,
    exclude_user_ids: set[int] | None = None,
) -> list[str]:
    """
    Extract @username / Telegram clickable user tags requested in a message (excluding the bot & sender):
    1) Explicit @username tokens & Telegram text_mention entities,
    2) Auto-learned Telegram group members (full names + cue-gated unique short names),
    3) Optional FNB_BIZ_STAFF_TELEGRAM_MAP env aliases.
    """
    from .internal_api import get_staff_telegram_map

    txt = raw_text or ""
    excluded = {f"@{(bot_username or 'POS_Lona_bot').lower()}", "@pos_lona_bot"}
    for h in exclude_handles or set():
        if h:
            excluded.add(h.strip().lower())
    excl_ids = set(exclude_user_ids or set())

    found: list[str] = []
    seen_lower: set[str] = set()

    def _add_tag(tag_str: str, uid: int | None = None) -> None:
        if not tag_str:
            return
        if uid is not None and uid in excl_ids:
            return
        low = tag_str.lower()
        if low in excluded or low in seen_lower:
            return
        m_id = re.search(r"tg://user\?id=(\d+)", tag_str)
        if m_id and int(m_id.group(1)) in excl_ids:
            return
        seen_lower.add(low)
        found.append(tag_str)

    # 1a. Explicit @username tokens
    for m in re.finditer(r"(?<![A-Za-z0-9_])@([A-Za-z0-9_]{3,64})\b", txt):
        _add_tag(f"@{m.group(1)}")

    # 1b. Telegram text_mention entities (when user tapped member picker without @username)
    if isinstance(msg, dict):
        for ent in msg.get("entities") or []:
            if isinstance(ent, dict) and ent.get("type") == "text_mention" and isinstance(ent.get("user"), dict):
                u = ent["user"]
                if u.get("is_bot"):
                    continue
                uid = u.get("id")
                uname = str(u.get("username") or "").strip().lstrip("@")
                if uname and re.fullmatch(r"[A-Za-z0-9_]{3,64}", uname):
                    _add_tag(f"@{uname}", uid=uid if isinstance(uid, int) else None)
                elif isinstance(uid, int) and uid > 0:
                    disp = " ".join(p for p in (str(u.get("first_name") or "").strip(), str(u.get("last_name") or "").strip()) if p).strip() or "Bạn"
                    _add_tag(f'<a href="tg://user?id={uid}">{html.escape(disp)}</a>', uid=uid)

    # 2 & 3. Vietnamese name lookup (FNB_BIZ_STAFF_TELEGRAM_MAP + learned Telegram group directory)
    norm = strip_vi(txt)
    has_tag_cue = any(
        re.search(rf"(?:^|\s){cue}\b", norm)
        for cue in ("tag", "nhac", "goi", "bao", "cho", "gui", "moi", "nho", "chao", "noi voi", "gioi thieu", "gui toi")
    )
    if has_tag_cue:
        combined_exact: dict[str, str] = {}
        if member_aliases:
            combined_exact.update(member_aliases)
        combined_exact.update(get_staff_telegram_map(cfg))
        for alias_norm, tag_target in sorted(combined_exact.items(), key=lambda kv: -len(kv[0])):
            if len(alias_norm) >= 2 and re.search(rf"(?<![a-z0-9]){re.escape(alias_norm)}(?![a-z0-9])", norm):
                _add_tag(tag_target)

        # Unique single-word short names ONLY when preceded by explicit tag/call/honorific word
        # so Vietnamese nouns like "tuần" ("tuan") or "tháng" ("thang") never trigger false mentions.
        if short_member_aliases:
            for short_norm, tag_target in sorted(short_member_aliases.items(), key=lambda kv: -len(kv[0])):
                if len(short_norm) < 3:
                    continue
                pat = rf"(?<![a-z0-9])(?:tag|nhac|moi|chao|gui|nho|anh|chi|em|ban|sep)\s+(?:(?:anh|chi|em|ban|sep)\s+)?{re.escape(short_norm)}(?![a-z0-9])"
                if re.search(pat, norm):
                    _add_tag(tag_target)
    return found
