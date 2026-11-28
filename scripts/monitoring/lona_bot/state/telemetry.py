"""Telemetry persistence, interaction token tracking, and Google PT quota timing."""

from __future__ import annotations

import datetime as dt
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from ..core.config import canonical_gemini_model
from ..core.vi_text import VN_TZ, vn_now
from .telemetry_reports import LA_TZ, TelemetryReportMixin, _atomic_write_json, _empty_bucket, google_quota_reset_info, plain_snippet

MAX_QA_LOG_DAYS = 7
MAX_QA_LOG_LINES = 1000


class TelemetryStore(TelemetryReportMixin):
    def __init__(
        self,
        stats_path: str | None = None,
        qa_log_path: str | None = None,
        max_days: int = MAX_QA_LOG_DAYS,
        max_lines: int = MAX_QA_LOG_LINES,
    ) -> None:
        self._stats_path = Path(stats_path) if stats_path else None
        self._qa_log_path = Path(qa_log_path) if qa_log_path else None
        self._max_days = max_days
        self._max_lines = max_lines
        self._stats: dict[str, Any] = self._load_stats()

    def _load_stats(self) -> dict[str, Any]:
        default_stats: dict[str, Any] = {
            "days": {},
            "pacific_days": {},
            "months": {},
            "recent_gemini": [],
            "last_gemini_error": None,
            "last_gemini_success": None,
        }
        if not self._stats_path or not self._stats_path.exists():
            return default_stats
        try:
            loaded = json.loads(self._stats_path.read_text(encoding="utf-8"))
        except Exception:
            return default_stats
        if not isinstance(loaded, dict):
            return default_stats
        res = {
            "days": loaded.get("days") if isinstance(loaded.get("days"), dict) else {},
            "pacific_days": loaded.get("pacific_days") if isinstance(loaded.get("pacific_days"), dict) else {},
            "months": loaded.get("months") if isinstance(loaded.get("months"), dict) else {},
            "recent_gemini": loaded.get("recent_gemini") if isinstance(loaded.get("recent_gemini"), list) else [],
            "last_gemini_error": loaded.get("last_gemini_error") if isinstance(loaded.get("last_gemini_error"), dict) else None,
            "last_gemini_success": loaded.get("last_gemini_success") if isinstance(loaded.get("last_gemini_success"), dict) else None,
        }
        # Backfill legacy VN-day calls into pacific_days when upgraded mid-day
        pac_key = google_quota_reset_info()["pacific_date"]
        vn_today = vn_now().date().isoformat()
        if pac_key == vn_today and vn_today in res["days"]:
            d_b = res["days"][vn_today]
            p_b = res["pacific_days"].setdefault(pac_key, _empty_bucket())
            if int(p_b.get("gemini_calls", 0) or 0) == 0 and int(d_b.get("gemini_calls", 0) or 0) > 0:
                p_b["gemini_calls"] = int(d_b.get("gemini_calls", 0) or 0)
                p_b["gemini_api_requests"] = int(d_b.get("gemini_api_requests") or p_b["gemini_calls"])
                p_b["gemini_prompt_tokens"] = int(d_b.get("gemini_prompt_tokens", 0) or 0)
                p_b["gemini_output_tokens"] = int(d_b.get("gemini_output_tokens", 0) or 0)
                p_b["gemini_total_tokens"] = int(d_b.get("gemini_total_tokens", 0) or 0)
            if int(p_b.get("gemini_calls", 0) or 0) > 0 and not isinstance(p_b.get("models"), dict):
                p_b["models"] = {}
            if int(p_b.get("gemini_calls", 0) or 0) > 0 and not p_b.get("models"):
                p_b["models"] = {
                    "gemini-3.5-flash-lite": {
                        "calls": int(p_b.get("gemini_calls", 0) or 0),
                        "api_requests": int(p_b.get("gemini_api_requests") or p_b.get("gemini_calls", 0)),
                        "tokens": int(p_b.get("gemini_total_tokens", 0) or 0),
                    }
                }
        return res

    def _save_stats(self) -> None:
        if not self._stats_path:
            return
        try:
            _atomic_write_json(self._stats_path, self._stats)
        except Exception:
            pass

    def _prune_old_days(self, today: dt.date) -> None:
        cutoff = (today - dt.timedelta(days=35)).isoformat()
        self._stats["days"] = {k: v for k, v in self._stats["days"].items() if k >= cutoff}
        self._stats["pacific_days"] = {k: v for k, v in self._stats["pacific_days"].items() if k >= cutoff}

    def record_gemini_error(
        self,
        http_code: int,
        message: str,
        now_dt: dt.datetime | None = None,
    ) -> None:
        now = (now_dt or vn_now()).astimezone(VN_TZ)
        self._stats["last_gemini_error"] = {
            "at": now.strftime("%H:%M:%S %d/%m"),
            "code": int(http_code or 0),
            "message": plain_snippet(message, limit=180),
        }
        self._save_stats()

    def record_interaction(
        self,
        question: str,
        reply: str,
        route: str,
        sender_label: str = "",
        prompt_tokens: int = 0,
        output_tokens: int = 0,
        total_tokens: int = 0,
        is_refusal: bool = False,
        msg_id: int | None = None,
        now_dt: dt.datetime | None = None,
        raw_q: str = "",
        trigger: str = "",
        model_used: str = "",
        api_requests: int = 0,
        model_requests: dict[str, int] | None = None,
        model_tokens: dict[str, int] | None = None,
        nlu_miss_candidate: bool = False,
    ) -> None:
        now = (now_dt or vn_now()).astimezone(VN_TZ)
        day_key = now.date().isoformat()
        pac_key = google_quota_reset_info(now)["pacific_date"]
        month_key = now.strftime("%Y-%m")
        req_inc = max(1, int(api_requests)) if route == "gemini" else 0
        canon_used = canonical_gemini_model(model_used or "gemini-3.5-flash-lite")

        for bucket_map, key in (
            (self._stats["days"], day_key),
            (self._stats["pacific_days"], pac_key),
            (self._stats["months"], month_key),
        ):
            b = bucket_map.setdefault(key, _empty_bucket())
            if route == "gemini":
                b["gemini_calls"] = int(b.get("gemini_calls", 0)) + 1
                b["gemini_api_requests"] = int(b.get("gemini_api_requests") or b.get("gemini_calls", 0) - 1) + req_inc
                b["gemini_prompt_tokens"] = int(b.get("gemini_prompt_tokens", 0)) + max(0, int(prompt_tokens))
                b["gemini_output_tokens"] = int(b.get("gemini_output_tokens", 0)) + max(0, int(output_tokens))
                b["gemini_total_tokens"] = int(b.get("gemini_total_tokens", 0)) + max(0, int(total_tokens))
                models_map = b.setdefault("models", {})
                if model_requests:
                    for raw_m, cnt in model_requests.items():
                        cm = canonical_gemini_model(raw_m)
                        mb = models_map.setdefault(cm, {"calls": 0, "api_requests": 0, "tokens": 0})
                        mb["calls"] = int(mb.get("calls", 0)) + (1 if cm == canon_used else 0)
                        mb["api_requests"] = int(mb.get("api_requests", 0)) + max(0, int(cnt))
                        mb["tokens"] = int(mb.get("tokens", 0)) + max(0, int((model_tokens or {}).get(raw_m, 0)))
                else:
                    mb = models_map.setdefault(canon_used, {"calls": 0, "api_requests": 0, "tokens": 0})
                    mb["calls"] = int(mb.get("calls", 0)) + 1
                    mb["api_requests"] = int(mb.get("api_requests", 0)) + req_inc
                    mb["tokens"] = int(mb.get("tokens", 0)) + max(0, int(total_tokens))
            elif route == "guardrail_block" or is_refusal:
                b["blocked_zero_token"] = int(b.get("blocked_zero_token", 0)) + 1
            else:
                b["local_zero_token"] = int(b.get("local_zero_token", 0)) + 1

        if route == "gemini":
            self._stats["last_gemini_success"] = {
                "at": now.strftime("%H:%M:%S %d/%m"),
                "model": model_used or "",
            }
            recent = list(self._stats.get("recent_gemini") or [])
            recent.append({
                "at": now.strftime("%H:%M %d/%m"),
                "q": plain_snippet(question, limit=75),
                "tokens": max(0, int(total_tokens)),
                "model": model_used or "",
            })
            self._stats["recent_gemini"] = recent[-5:]

        self._prune_old_days(now.date())
        self._save_stats()

        if self._qa_log_path:
            entry: dict[str, Any] = {
                "ts": now.isoformat(timespec="seconds"),
                "msg_id": msg_id,
                "sender": plain_snippet(sender_label, limit=40),
                "trigger": trigger or route,
                "route": route,
                "is_refusal": bool(is_refusal),
                "q": plain_snippet(question, limit=180),
                "a": plain_snippet(reply, limit=260),
                "tokens": max(0, int(total_tokens)),
            }
            if raw_q and raw_q.strip() != question.strip():
                entry["raw_q"] = plain_snippet(raw_q, limit=180)
            if model_used:
                entry["model"] = model_used
            if nlu_miss_candidate:
                entry["nlu_miss_candidate"] = True
            self._append_qa_log(entry, now.date())

    def _append_qa_log(self, entry: dict[str, Any], today: dt.date) -> None:
        assert self._qa_log_path is not None
        try:
            self._qa_log_path.parent.mkdir(parents=True, exist_ok=True)
            lines: list[str] = []
            if self._qa_log_path.exists():
                cutoff_iso = (today - dt.timedelta(days=self._max_days)).isoformat()
                for raw in self._qa_log_path.read_text(encoding="utf-8").splitlines():
                    if not raw.strip():
                        continue
                    try:
                        rec = json.loads(raw)
                        if str(rec.get("ts", ""))[:10] >= cutoff_iso:
                            lines.append(raw)
                    except Exception:
                        continue
            lines.append(json.dumps(entry, ensure_ascii=False))
            lines = lines[-self._max_lines :]
            tmp = self._qa_log_path.with_suffix(".jsonl.tmp")
            tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
            os.replace(tmp, self._qa_log_path)
        except Exception:
            pass
