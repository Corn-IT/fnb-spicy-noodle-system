"""Multi-pool Gemini RPM & cooldown scheduler across free-tier models."""

from __future__ import annotations

import datetime as dt
import re
import time
from typing import Any

from ..core.config import canonical_gemini_model, get_gemini_pool_specs, resolve_gemini_model_pool
from ..core.vi_text import vn_now

_PROBE_CACHE: dict[str, Any] = {"ts": 0.0, "result": None}
_MODEL_COOLDOWNS: dict[str, dict[str, Any]] = {}
_MODEL_RPM_TIMESTAMPS: dict[str, list[float]] = {}

try:
    from zoneinfo import ZoneInfo as _ZoneInfo
except ImportError:
    _ZoneInfo = None  # type: ignore[misc,assignment]

_LA_TZ = _ZoneInfo("America/Los_Angeles") if _ZoneInfo else dt.timezone(dt.timedelta(hours=-8))

def reset_ai_runtime_state() -> None:
    """Clear transient cooldown, RPM windows, and probe caches (useful in tests)."""
    _MODEL_COOLDOWNS.clear()
    _MODEL_RPM_TIMESTAMPS.clear()
    _PROBE_CACHE["ts"] = 0.0
    _PROBE_CACHE["result"] = None


def _seconds_until_pacific_reset() -> int:
    now_vn = vn_now()
    now_la = now_vn.astimezone(_LA_TZ)
    next_la_date = now_la.date() + dt.timedelta(days=1)
    if isinstance(_LA_TZ, dt.tzinfo):
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=_LA_TZ)
    else:
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=dt.timezone(dt.timedelta(hours=-8)))
    return max(60, min(86400, int((next_reset_la.astimezone(now_vn.tzinfo or dt.timezone.utc) - now_vn).total_seconds())))


def get_model_rpm_used(model: str, now_mono: float | None = None) -> int:
    canon = canonical_gemini_model(model)
    now = time.monotonic() if now_mono is None else now_mono
    ts_list = [t for t in _MODEL_RPM_TIMESTAMPS.get(canon, []) if now - t < 60.0]
    _MODEL_RPM_TIMESTAMPS[canon] = ts_list
    return len(ts_list)


def _record_model_rpm(model: str, now_mono: float | None = None) -> None:
    canon = canonical_gemini_model(model)
    now = time.monotonic() if now_mono is None else now_mono
    ts_list = [t for t in _MODEL_RPM_TIMESTAMPS.get(canon, []) if now - t < 60.0]
    ts_list.append(now)
    _MODEL_RPM_TIMESTAMPS[canon] = ts_list


def _mark_model_cooldown(
    model: str,
    http_code: int,
    err_msg: str = "",
    now_mono: float | None = None,
) -> None:
    canon = canonical_gemini_model(model)
    now = time.monotonic() if now_mono is None else now_mono
    low = (err_msg or "").lower()
    if http_code == 429:
        if any(k in low for k in ("perday", "per day", "requestsperday", "generaterequestsperday", "daily")):
            ttl = float(_seconds_until_pacific_reset())
            reason = "daily_quota"
        else:
            ttl = 65.0
            reason = "rpm_limit"
    elif http_code in (400, 404):
        ttl = 21600.0
        reason = "unsupported"
    elif http_code in (401, 403):
        ttl = 300.0
        reason = "auth_error"
    else:
        ttl = 90.0
        reason = "temporary_overload"

    _MODEL_COOLDOWNS[canon] = {
        "until": now + ttl,
        "code": int(http_code or 0),
        "reason": reason,
        "detail": (err_msg or "")[:120],
    }


def _active_cooldown(model: str, now_mono: float | None = None) -> dict[str, Any] | None:
    canon = canonical_gemini_model(model)
    info = _MODEL_COOLDOWNS.get(canon)
    if not info:
        return None
    now = time.monotonic() if now_mono is None else now_mono
    rem = float(info.get("until") or 0) - now
    if rem <= 0:
        _MODEL_COOLDOWNS.pop(canon, None)
        return None
    return {
        "reason": str(info.get("reason") or "cooldown"),
        "code": int(info.get("code") or 0),
        "remaining_sec": max(1, int(round(rem))),
    }


def get_model_runtime_states(now_mono: float | None = None) -> dict[str, dict[str, Any]]:
    """Return active cooldown & 60s RPM usage per canonical model name."""
    now = time.monotonic() if now_mono is None else now_mono
    models = set(_MODEL_RPM_TIMESTAMPS.keys()) | set(_MODEL_COOLDOWNS.keys())
    out: dict[str, dict[str, Any]] = {}
    for m in models:
        rpm_used = get_model_rpm_used(m, now_mono=now)
        cd = _active_cooldown(m, now_mono=now)
        if rpm_used > 0 or cd is not None:
            out[m] = {"rpm_used_60s": rpm_used, "cooldown": cd}
    return out


def _select_ordered_models(cfg: dict[str, str], now_mono: float | None = None) -> list[str]:
    """
    Order pool models smartly:
    1) Healthy models below proactive RPM threshold (~73% of RPM limit, preventing yellow 429 bursts)
    2) Healthy models approaching RPM limit (still usable before failing)
    3) Transiently cooling models (only as last resort if all pools are temporarily cooling; skip daily/unsupported)
    """
    now = time.monotonic() if now_mono is None else now_mono
    specs = get_gemini_pool_specs(cfg)
    normal: list[str] = []
    near_rpm: list[str] = []
    transient_cooling: list[str] = []

    for spec in specs:
        model = str(spec["model"])
        cd = _active_cooldown(model, now_mono=now)
        if cd is not None:
            if cd["reason"] in ("rpm_limit", "temporary_overload"):
                transient_cooling.append(model)
            continue
        rpm_limit = max(1, int(spec.get("rpm") or 15))
        soft_cap = max(2, int(rpm_limit * 0.73))
        if get_model_rpm_used(model, now_mono=now) >= soft_cap:
            near_rpm.append(model)
        else:
            normal.append(model)

    ordered = normal + near_rpm
    if ordered:
        return ordered
    if transient_cooling:
        return transient_cooling
    return [str(s["model"]) for s in specs] or resolve_gemini_model_pool(cfg)


class GeminiApiError(RuntimeError):
    def __init__(self, http_code: int, message: str, model: str = "") -> None:
        super().__init__(message)
        self.http_code = http_code
        self.detail = message
        self.model = model


def _scrub_key(text: str, api_key: str) -> str:
    if not text:
        return ""
    cleaned = text.replace(api_key, "***") if api_key else text
    return re.sub(r"key=AIza[0-9A-Za-z_-]+", "key=***", cleaned)
