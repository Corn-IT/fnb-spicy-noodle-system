"""Configuration loader, Gemini model pool definitions, and runtime toggle sync."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .vi_text import VN_TZ

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

_TOGGLE_CACHE_TTL_SEC = 30.0
_TOGGLE_CACHE: dict[str, Any] = {"ts": 0.0, "payload": None}


def reset_toggle_cache() -> None:
    _TOGGLE_CACHE["ts"] = 0.0
    _TOGGLE_CACHE["payload"] = None


def _env_bool(raw: str | None, default: bool = True) -> bool:
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def resolve_ai_engine_toggles(
    cfg: dict[str, str] | None = None,
    force_refresh: bool = False,
    now_mono: float | None = None,
) -> dict[str, Any]:
    """Return active Local / Gemini flags, optionally synced from Web /settings StoreSettings."""
    cfg_eff = cfg or get_biz_config()
    now = now_mono if now_mono is not None else time.monotonic()
    local_env = _env_bool(cfg_eff.get("ai_local_enabled", os.environ.get("FNB_AI_LOCAL_ENABLED")), True)
    gemini_env = _env_bool(cfg_eff.get("ai_gemini_enabled", os.environ.get("FNB_AI_GEMINI_ENABLED")), True)
    fallback = {
        "enabled": True,
        "local_enabled": local_env,
        "gemini_enabled": gemini_env,
        "synced_from_web": False,
    }
    if not force_refresh and _TOGGLE_CACHE["payload"] is not None and (now - _TOGGLE_CACHE["ts"]) < _TOGGLE_CACHE_TTL_SEC:
        return dict(_TOGGLE_CACHE["payload"])

    if not cfg_eff.get("ro_db_url") and os.environ.get("FNB_BIZ_SYNC_DB_SKIP") == "1":
        return fallback

    try:
        from .internal_api import run_readonly_sql_json

        rows = run_readonly_sql_json(
            "SELECT metadata->'aiAssistant' AS ai_cfg "
            "FROM public.v_bot_master_data "
            "WHERE category = 'SYSTEM_CONFIG' AND normalized_name = 'store_settings'",
            max_rows=1,
            cfg=cfg_eff,
        )
        raw_ai = (rows[0] if rows else {}).get("ai_cfg")
        if isinstance(raw_ai, str):
            raw_ai = json.loads(raw_ai)
        if isinstance(raw_ai, dict) and raw_ai.get("syncToTelegramBot") is True:
            master_on = bool(raw_ai.get("enabled", True))
            resolved = {
                "enabled": master_on,
                "local_enabled": master_on and bool(raw_ai.get("localEnabled", True)),
                "gemini_enabled": master_on and bool(raw_ai.get("geminiEnabled", True)),
                "synced_from_web": True,
            }
            _TOGGLE_CACHE["ts"] = now
            _TOGGLE_CACHE["payload"] = resolved
            return dict(resolved)
    except Exception:
        pass

    _TOGGLE_CACHE["ts"] = now
    _TOGGLE_CACHE["payload"] = fallback
    return dict(fallback)
