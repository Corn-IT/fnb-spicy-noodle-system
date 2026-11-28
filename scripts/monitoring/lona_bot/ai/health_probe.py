"""Zero-token parallel Gemini Developer API health & multi-pool status prober."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from ..core.config import get_biz_config, get_gemini_pool_specs
from .pool_manager import _PROBE_CACHE, _active_cooldown, _scrub_key, get_model_rpm_used


def probe_gemini_status(
    cfg: dict[str, str] | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Zero-token parallel health/metadata check against Gemini Developer API /v1beta/models/{model}.
    Confirms API key validity, active multi-pool backup models, RPM usage, and cooldown state.
    """
    cfg = cfg or get_biz_config()
    api_key = cfg.get("gemini_api_key", "").strip()
    specs = get_gemini_pool_specs(cfg)

    now = time.monotonic()
    cached_res = _PROBE_CACHE.get("result")
    pool_sig = ",".join(s["model"] for s in specs)
    if (
        not force_refresh
        and cached_res is not None
        and cached_res.get("_key_hint") == (api_key[-4:] if api_key else "")
        and cached_res.get("_pool_sig") == pool_sig
        and now - float(_PROBE_CACHE.get("ts") or 0) < 60.0
    ):
        return cached_res

    if not api_key:
        return {"configured": False, "key_valid": False, "models": [], "_key_hint": "", "_pool_sig": pool_sig}

    def check_one(idx_spec: tuple[int, dict[str, Any]]) -> dict[str, Any]:
        idx, spec = idx_spec
        model_name = str(spec["model"])
        role_lbl = "Chính" if idx == 0 else ("Dự phòng" if idx == 1 else str(spec["label"]))
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}?key={api_key}"
        req = urllib.request.Request(url, method="GET")
        cd = _active_cooldown(model_name)
        rpm_used = get_model_rpm_used(model_name)
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                ms = round((time.monotonic() - t0) * 1000)
                meta = json.loads(resp.read().decode("utf-8"))
                return {
                    "role": role_lbl,
                    "tier": spec["tier"],
                    "short": spec["short"],
                    "rpd": spec["rpd"],
                    "rpm": spec["rpm"],
                    "tpm": spec["tpm"],
                    "rpm_used_60s": rpm_used,
                    "cooldown": cd,
                    "model": model_name,
                    "ok": True,
                    "status_code": 200,
                    "latency_ms": ms,
                    "display_name": str(meta.get("displayName") or model_name),
                    "version": str(meta.get("version") or ""),
                    "input_limit": int(meta.get("inputTokenLimit") or 0),
                    "output_limit": int(meta.get("outputTokenLimit") or 0),
                    "error": "",
                }
        except urllib.error.HTTPError as err:
            ms = round((time.monotonic() - t0) * 1000)
            body_err = _scrub_key(err.read().decode("utf-8", "replace")[:200], api_key)
            return {
                "role": role_lbl,
                "tier": spec["tier"],
                "short": spec["short"],
                "rpd": spec["rpd"],
                "rpm": spec["rpm"],
                "tpm": spec["tpm"],
                "rpm_used_60s": rpm_used,
                "cooldown": cd,
                "model": model_name,
                "ok": False,
                "status_code": int(err.code),
                "latency_ms": ms,
                "display_name": model_name,
                "version": "",
                "input_limit": 0,
                "output_limit": 0,
                "error": f"HTTP {err.code}: {body_err}",
            }
        except Exception as err:
            ms = round((time.monotonic() - t0) * 1000)
            return {
                "role": role_lbl,
                "tier": spec["tier"],
                "short": spec["short"],
                "rpd": spec["rpd"],
                "rpm": spec["rpm"],
                "tpm": spec["tpm"],
                "rpm_used_60s": rpm_used,
                "cooldown": cd,
                "model": model_name,
                "ok": False,
                "status_code": 0,
                "latency_ms": ms,
                "display_name": model_name,
                "version": "",
                "input_limit": 0,
                "output_limit": 0,
                "error": _scrub_key(str(err)[:160], api_key),
            }

    items = list(enumerate(specs))
    if len(items) == 1:
        model_results = [check_one(items[0])]
    else:
        with ThreadPoolExecutor(max_workers=min(6, len(items))) as ex:
            model_results = list(ex.map(check_one, items))

    any_valid = any(m["ok"] or m.get("status_code") in (429, 500, 503) for m in model_results)
    res = {
        "configured": True,
        "key_valid": any_valid,
        "models": model_results,
        "_key_hint": api_key[-4:],
        "_pool_sig": pool_sig,
    }
    _PROBE_CACHE["ts"] = now
    _PROBE_CACHE["result"] = res
    return res
