#!/usr/bin/env python3
"""
Shared helpers for @POS_Lona_bot (fnb-biz-bot):
- Env config loading
- Vietnam timezone + money/date formatters
- Vietnamese diacritic normalization & flexible period parser
- Defense-in-depth read-only SQL validator & executor via fnb_bot_ro
- Internal NestJS loopback API caller (/internal/biz/*)
- Telegram HTML sender & message splitter
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import subprocess
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

VN_TZ = dt.timezone(dt.timedelta(hours=7))

FORBIDDEN_SQL_KEYWORDS = re.compile(
    r"\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|VACUUM|"
    r"ANALYZE|REINDEX|CLUSTER|COMMENT|LOCK|SET|RESET|SHOW|BEGIN|COMMIT|ROLLBACK|"
    r"SAVEPOINT|RELEASE|EXECUTE|PREPARE|DEALLOCATE|CALL|DO|LISTEN|NOTIFY|UNLISTEN|"
    r"LOAD|SECURITY|OWNER|TABLESPACE|EXTENSION|PUBLICATION|SUBSCRIPTION)\b",
    re.I,
)

FORBIDDEN_SQL_ANYWHERE = re.compile(
    r"\b(?:password_hash|web_push_vapid_keys|p256dh)\b",
    re.I,
)

FORBIDDEN_SQL_IDENTIFIERS = re.compile(
    r"\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_sleep|"
    r"pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink|dblink_exec|"
    r"pg_shadow|pg_authid|master_data|auth)\b",
    re.I,
)

ALLOWED_HTML_TAGS = {"b", "strong", "i", "em", "code", "pre", "u", "s"}


def load_env_file(env_path: str) -> dict[str, str]:
    merged = dict(os.environ)
    path = Path(env_path)
    if path.exists():
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            if key and key not in os.environ:
                merged[key] = value
    return merged


DEFAULT_GEMINI_PRIMARY = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_FALLBACK = "gemini-3.1-flash-lite"
DEFAULT_GEMINI_MODEL_POOL = (
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-4-hydrogen",
)

GEMINI_ALIAS_CANONICAL: dict[str, str] = {
    "gemini-flash-lite-latest": "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
    "gemini-3.5-flash": "gemini-3.6-flash",
}

# Verified Free Tier per-model quotas on Google AI Studio (independent daily RPD & minute RPM/TPM pools)
GEMINI_FREE_TIER_SPECS: dict[str, dict[str, Any]] = {
    "gemini-3.5-flash-lite": {"short": "3.5 Lite", "label": "Chính · 3.5 Flash-Lite", "rpd": 500, "rpm": 15, "tpm": 250000, "tier": "primary"},
    "gemini-3.1-flash-lite": {"short": "3.1 Lite", "label": "Dự phòng 1 · 3.1 Flash-Lite", "rpd": 500, "rpm": 15, "tpm": 250000, "tier": "peer"},
    "gemini-3-flash-preview": {"short": "3 Flash", "label": "Dự phòng 2 · 3 Flash", "rpd": 20, "rpm": 5, "tpm": 250000, "tier": "backup"},
    "gemini-3.6-flash": {"short": "3.6 Flash", "label": "Dự phòng 2 · 3.6 Flash", "rpd": 20, "rpm": 5, "tpm": 250000, "tier": "backup"},
    "gemini-3.8-flash": {"short": "3.8 Flash", "label": "Dự phòng 2 · 3.8 Flash", "rpd": 20, "rpm": 5, "tpm": 250000, "tier": "backup"},
    "gemini-4-hydrogen": {"short": "G4 Hydro", "label": "Dự phòng 2 · Gemini 4 Hydro", "rpd": 20, "rpm": 5, "tpm": 250000, "tier": "backup"},
}


def canonical_gemini_model(model_name: str) -> str:
    clean = (model_name or "").strip().removeprefix("models/")
    return GEMINI_ALIAS_CANONICAL.get(clean, clean)


def get_biz_config(env_file: str | None = None) -> dict[str, str]:
    env = load_env_file(env_file or os.environ.get("BIZ_BOT_ENV_FILE", "/etc/fnb-biz-bot.env"))
    default_pool_csv = ",".join(DEFAULT_GEMINI_MODEL_POOL)
    return {
        "bot_token": env.get("FNB_BIZ_BOT_TOKEN", "").strip(),
        "chat_id": env.get("FNB_BIZ_CHAT_ID", "").strip(),
        "gemini_api_key": env.get("FNB_GEMINI_API_KEY", "").strip(),
        "gemini_model": env.get("FNB_GEMINI_MODEL", DEFAULT_GEMINI_PRIMARY).strip() or DEFAULT_GEMINI_PRIMARY,
        "gemini_fallback_model": env.get("FNB_GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK).strip() or DEFAULT_GEMINI_FALLBACK,
        "gemini_model_pool": env.get("FNB_GEMINI_MODEL_POOL", default_pool_csv).strip() or default_pool_csv,
        "project_name": env.get("FNB_ALERT_PROJECT_NAME", "Ăn Vặt Tran").strip() or "Ăn Vặt Tran",
        "project_dir": env.get("FNB_PROJECT_DIR", "/opt/fnb-pos").strip() or "/opt/fnb-pos",
        "domain": env.get("FNB_DOMAIN", "pos.anvattran.com").strip() or "pos.anvattran.com",
        "ro_db_user": env.get("FNB_BOT_RO_DB_USER", "fnb_bot_ro").strip() or "fnb_bot_ro",
        "high_void_threshold": env.get("FNB_BIZ_HIGH_VOID_THRESHOLD", "150000").strip() or "150000",
        "alert_state_file": env.get("FNB_BIZ_ALERT_STATE_FILE", "/var/lib/fnb-biz-alerts/state.json").strip() or "/var/lib/fnb-biz-alerts/state.json",
        "memory_file": env.get("FNB_BIZ_MEMORY_FILE", "/var/lib/fnb-biz-alerts/biz-memory.json").strip() or "/var/lib/fnb-biz-alerts/biz-memory.json",
        "qa_log_file": env.get("FNB_BIZ_QA_LOG_FILE", "/var/lib/fnb-biz-alerts/biz-qa-log.jsonl").strip() or "/var/lib/fnb-biz-alerts/biz-qa-log.jsonl",
        "token_stats_file": env.get("FNB_BIZ_TOKEN_STATS_FILE", "/var/lib/fnb-biz-alerts/biz-token-stats.json").strip() or "/var/lib/fnb-biz-alerts/biz-token-stats.json",
        "member_cache_file": env.get("FNB_BIZ_MEMBER_CACHE_FILE", "/var/lib/fnb-biz-alerts/tg-members.json").strip() or "/var/lib/fnb-biz-alerts/tg-members.json",
        "staff_tg_map_raw": env.get("FNB_BIZ_STAFF_TELEGRAM_MAP", "").strip(),
        "gemini_tier_name": env.get("FNB_GEMINI_TIER_NAME", "Free Tier").strip() or "Free Tier",
        "gemini_rpd_limit": env.get("FNB_GEMINI_RPD_LIMIT", "500").strip() or "500",
        "gemini_rpm_limit": env.get("FNB_GEMINI_RPM_LIMIT", "15").strip() or "15",
        "gemini_tpm_limit": env.get("FNB_GEMINI_TPM_LIMIT", "250000").strip() or "250000",
        "gemini_daily_token_budget": env.get("FNB_GEMINI_DAILY_TOKEN_BUDGET", "").strip(),
    }


def resolve_gemini_model_pool(cfg: dict[str, str] | None = None) -> list[str]:
    """
    Build the ordered, canonical-deduplicated Gemini model failover chain.
    Eliminates duplicate buckets (e.g. gemini-flash-lite-latest == gemini-3.5-flash-lite).
    """
    c = cfg or {}
    primary = (c.get("gemini_model") or DEFAULT_GEMINI_PRIMARY).strip()
    fallback = (c.get("gemini_fallback_model") or "").strip()
    raw_pool = (c.get("gemini_model_pool") or "").strip()
    rpd_raw = str(c.get("gemini_rpd_limit") or "").strip()
    tier_raw = (c.get("gemini_tier_name") or "Free Tier").strip().lower()

    candidates: list[str] = [primary]
    if fallback:
        candidates.append(fallback)
    if raw_pool:
        candidates.extend(x.strip() for x in raw_pool.split(",") if x.strip())
    elif not (rpd_raw.isdigit() and int(rpd_raw) != 500) and "free" in tier_raw:
        candidates.extend(DEFAULT_GEMINI_MODEL_POOL)

    result: list[str] = []
    seen_canonical: set[str] = set()
    for raw in candidates:
        if not raw:
            continue
        canon = canonical_gemini_model(raw)
        if canon in seen_canonical:
            continue
        seen_canonical.add(canon)
        # Prefer the explicit non-alias canonical name when alias collides with primary
        chosen = canon if (raw in GEMINI_ALIAS_CANONICAL and len(result) > 0) else raw
        if canonical_gemini_model(chosen) == chosen and chosen in GEMINI_FREE_TIER_SPECS:
            result.append(chosen)
        else:
            result.append(canon if raw in GEMINI_ALIAS_CANONICAL else raw)
    return result or [DEFAULT_GEMINI_PRIMARY]


def get_gemini_pool_specs(cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """Return quota specs ({model, short, label, rpd, rpm, tpm, tier}) for every model in the active pool."""
    c = cfg or {}
    models = resolve_gemini_model_pool(c)
    rpd_raw = str(c.get("gemini_rpd_limit") or "").strip()
    rpm_raw = str(c.get("gemini_rpm_limit") or "").strip()
    tpm_raw = str(c.get("gemini_tpm_limit") or "").strip()
    custom_rpd = int(rpd_raw) if rpd_raw.isdigit() and int(rpd_raw) > 0 else None
    custom_rpm = int(rpm_raw) if rpm_raw.isdigit() and int(rpm_raw) > 0 else None
    custom_tpm = int(tpm_raw) if tpm_raw.isdigit() and int(tpm_raw) > 0 else None

    specs: list[dict[str, Any]] = []
    for idx, model in enumerate(models):
        canon = canonical_gemini_model(model)
        base = GEMINI_FREE_TIER_SPECS.get(canon) or {
            "short": model.replace("gemini-", ""),
            "label": "Chính" if idx == 0 else f"Dự phòng {idx}",
            "rpd": custom_rpd or 500,
            "rpm": custom_rpm or 15,
            "tpm": custom_tpm or 250000,
            "tier": "primary" if idx == 0 else "backup",
        }
        rpd = custom_rpd if (idx == 0 and custom_rpd is not None) else int(base["rpd"])
        rpm = custom_rpm if (idx == 0 and custom_rpm is not None) else int(base["rpm"])
        tpm = custom_tpm if (idx == 0 and custom_tpm is not None) else int(base["tpm"])
        specs.append({
            "model": model,
            "canonical": canon,
            "short": str(base["short"]),
            "label": str(base["label"]),
            "rpd": rpd,
            "rpm": rpm,
            "tpm": tpm,
            "tier": "primary" if idx == 0 else str(base["tier"]),
        })
    return specs


def get_staff_telegram_map(cfg: dict[str, str] | None = None) -> dict[str, str]:
    """Parse optional FNB_BIZ_STAFF_TELEGRAM_MAP JSON into {norm_name: '@handle'}."""
    raw = ((cfg or get_biz_config()).get("staff_tg_map_raw") or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    mapping: dict[str, str] = {}
    for k, v in parsed.items():
        nk = strip_vi(str(k or ""))
        handle = str(v or "").strip()
        if nk and handle:
            mapping[nk] = handle if handle.startswith("@") else f"@{handle}"
    return mapping


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


def _strip_sql_comments_and_strings(sql: str) -> tuple[str, bool]:
    """Remove comments to detect multi-statement or hidden keywords safely."""
    if re.search(r"/\*|\*/|--", sql):
        return "", False
    return sql.strip(), True


def validate_readonly_sql(raw_sql: str) -> tuple[bool, str]:
    """
    Strict Python defense-in-depth SQL validator layered on top of PostgreSQL fnb_bot_ro role.
    Returns (is_valid, cleaned_sql_or_error_reason).
    """
    sql = (raw_sql or "").strip()
    if not sql:
        return False, "Câu truy vấn SQL trống"

    cleaned, comments_ok = _strip_sql_comments_and_strings(sql)
    if not comments_ok:
        return False, "Không cho phép comment SQL (-- hoặc /* */)"

    # Strip at most one trailing semicolon
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1].strip()
    if ";" in cleaned:
        return False, "Chỉ được phép thực thi đúng 1 câu lệnh SELECT duy nhất"

    # Strip quoted string literals before checking SQL keywords so literals like 'UPDATE' don't cause false positives
    no_strings = re.sub(r"'(?:''|[^'])*'", "''", cleaned)
    if not re.match(r"^(?:SELECT|WITH)\b", no_strings, re.I):
        return False, "Chỉ cho phép truy vấn bắt đầu bằng SELECT hoặc WITH"

    if FORBIDDEN_SQL_KEYWORDS.search(no_strings):
        return False, "Phát hiện từ khóa SQL không thuộc phạm vi đọc dữ liệu (read-only)"

    if FORBIDDEN_SQL_ANYWHERE.search(cleaned) or FORBIDDEN_SQL_IDENTIFIERS.search(no_strings):
        return False, "Truy vấn chạm tới khóa mật mã kỹ thuật hoặc bảng/hàm hệ thống bị hạn chế"

    if re.search(r"\b(?:users|push_subscriptions)\b", no_strings, re.I) and re.search(
        r"(?:\bSELECT\b|,)\s*(?:[a-z_][a-z0-9_]*\.)?\*\s*(?:,|\bFROM\b)",
        no_strings,
        re.I,
    ):
        return False, "Không dùng SELECT * khi truy vấn users/push_subscriptions (vui lòng liệt kê rõ cột cần xem)"

    if len(cleaned) > 3500:
        return False, "Truy vấn SQL quá dài"

    return True, cleaned


def run_cmd(args: list[str], cwd: str | None = None, timeout: int = 12) -> tuple[int, str]:
    proc = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    out = proc.stdout or ""
    err = proc.stderr or ""
    combined = out if not err else (f"{out}\n{err}" if out else err)
    return proc.returncode, combined.strip()


def call_internal_biz(endpoint: str, params: dict[str, Any] | None = None, cfg: dict[str, str] | None = None) -> dict[str, Any]:
    cfg = cfg or get_biz_config()
    clean_ep = "/" + endpoint.lstrip("/")
    if not clean_ep.startswith("/internal/biz/"):
        raise ValueError(f"Unsupported internal endpoint: {endpoint}")

    qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None and v != ""})
    url = f"http://127.0.0.1:3000{clean_ep}" + (f"?{qs}" if qs else "")

    rc, out = run_cmd(
        ["docker", "compose", "exec", "-T", "api-server", "wget", "-qO-", url],
        cwd=cfg["project_dir"],
        timeout=15,
    )
    if rc != 0 or not out:
        raise RuntimeError(f"Internal API {clean_ep} error (rc={rc}): {out[:200]}")
    return json.loads(out)


def run_readonly_sql_json(sql: str, max_rows: int = 50, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    cfg = cfg or get_biz_config()
    ok, cleaned_or_err = validate_readonly_sql(sql)
    if not ok:
        raise ValueError(cleaned_or_err)

    bounded_limit = max(1, min(int(max_rows), 50))
    wrapped_sql = (
        f"SELECT COALESCE(json_agg(t), '[]'::json)::text "
        f"FROM (SELECT * FROM ({cleaned_or_err}) AS _bot_q LIMIT {bounded_limit}) AS t;"
    )

    proc = subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            cfg["ro_db_user"],
            "-d",
            "fnb_pos",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ],
        cwd=cfg["project_dir"],
        capture_output=True,
        text=True,
        timeout=8,
        shell=False,
    )
    if proc.returncode != 0:
        err_msg = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Lỗi truy vấn PostgreSQL: {err_msg[:240]}")

    raw_json = (proc.stdout or "").strip()
    if not raw_json:
        return []
    return json.loads(raw_json)


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
