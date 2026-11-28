"""Internal loopback HTTP client and read-only SQL executor (fnb_bot_ro)."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.parse
import urllib.request
from typing import Any

from .config import get_biz_config
from .sql_guard import validate_readonly_sql
from .vi_text import strip_vi

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
    cfg_eff = {**get_biz_config(), **(cfg or {})}
    clean_ep = "/" + endpoint.lstrip("/")
    if not clean_ep.startswith("/internal/biz/"):
        raise ValueError(f"Unsupported internal endpoint: {endpoint}")

    qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None and v != ""})
    url = f"http://127.0.0.1:3000{clean_ep}" + (f"?{qs}" if qs else "")

    rc, out = run_cmd(
        ["docker", "compose", "exec", "-T", "api-server", "wget", "-qO-", url],
        cwd=cfg_eff["project_dir"],
        timeout=15,
    )
    if rc != 0 or not out:
        raise RuntimeError(f"Internal API {clean_ep} error (rc={rc}): {out[:200]}")
    return json.loads(out)


def run_readonly_sql_json(sql: str, max_rows: int = 50, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    cfg_eff = {**get_biz_config(), **(cfg or {})}
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
            cfg_eff["ro_db_user"],
            "-d",
            "fnb_pos",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            wrapped_sql,
        ],
        cwd=cfg_eff["project_dir"],
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
