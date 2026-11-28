"""Read-only SQL whitelist validator and safe PostgreSQL date/string helpers."""

from __future__ import annotations

import datetime as dt
import re

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

def sql_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def vn_bounds_sql(from_date: str, to_date: str) -> tuple[str, str]:
    start_ts = f"{from_date} 00:00:00+07"
    end_d = dt.date.fromisoformat(to_date) + dt.timedelta(days=1)
    end_ts = f"{end_d.isoformat()} 00:00:00+07"
    return sql_quote(start_ts), sql_quote(end_ts)
