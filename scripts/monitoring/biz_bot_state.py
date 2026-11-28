#!/usr/bin/env python3
"""
Persistent Structured Conversation Context, 7-Day Rolling Q&A Audit Log,
Google Pacific Quota Cycle Tracking & /token / /gemini Telemetry Store.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

try:
    from zoneinfo import ZoneInfo

    LA_TZ = ZoneInfo("America/Los_Angeles")
except Exception:
    LA_TZ = dt.timezone(dt.timedelta(hours=-8))

from biz_bot_common import VN_TZ, fmt_vnd, vn_now

MAX_HISTORY_TURNS = 4
HISTORY_TTL_SEC = 600
MAX_QA_LOG_DAYS = 7
MAX_QA_LOG_LINES = 1000

SLOT_KEYS = (
    "intent",
    "period_raw",
    "period_label",
    "product_id",
    "product_name",
    "employee_id",
    "employee_name",
    "table_name",
    "order_code",
)


def plain_snippet(text: str, limit: int = 500) -> str:
    clean = re.sub(r"<[^>]+>", " ", text or "")
    clean = html.unescape(re.sub(r"\s+", " ", clean)).strip()
    return clean[:limit] if len(clean) <= limit else clean[: limit - 1] + "…"


def extract_slots_from_text(text: str) -> dict[str, Any]:
    """Extract referenced order_code (HD-/ORD-) and table_name (Bàn NN) from any bot reply."""
    plain = plain_snippet(text, limit=1500)
    slots: dict[str, Any] = {}
    m_ord = re.search(r"\b((?:HD|ORD)-[A-Z0-9-]{4,})\b", plain, re.I)
    if m_ord:
        slots["order_code"] = m_ord.group(1).upper()
    m_tbl = re.search(r"\b(?:Bàn|Ban)\s+0*(\d{1,2})\b", plain, re.I)
    if m_tbl:
        slots["table_name"] = f"Bàn {int(m_tbl.group(1)):02d}"
    return slots


def google_quota_reset_info(now_dt: dt.datetime | None = None) -> dict[str, str]:
    """
    Compute the current Google Gemini Developer API daily quota date (America/Los_Angeles)
    and exact countdown to next 00:00 Pacific reset converted into Vietnam time (+07:00).
    """
    now_vn = (now_dt or vn_now()).astimezone(VN_TZ)
    now_la = now_vn.astimezone(LA_TZ)
    next_la_date = now_la.date() + dt.timedelta(days=1)
    if isinstance(LA_TZ, dt.tzinfo):
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=LA_TZ)
    else:
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=dt.timezone(dt.timedelta(hours=-8)))
    next_reset_vn = next_reset_la.astimezone(VN_TZ)
    delta_sec = max(0, int((next_reset_vn - now_vn).total_seconds()))
    hours = delta_sec // 3600
    mins = (delta_sec % 3600) // 60
    day_word = "hôm nay" if next_reset_vn.date() == now_vn.date() else "ngày mai"
    return {
        "pacific_date": now_la.date().isoformat(),
        "reset_vn_str": f"{next_reset_vn.strftime('%H:%M')} {day_word} ({next_reset_vn.strftime('%d/%m')})",
        "countdown_str": f"{hours} giờ {mins:02d} phút",
    }


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


class ConversationMemory:
    """Short-lived per-chat follow-up context + structured entity slots (optionally disk-backed)."""

    def __init__(
        self,
        max_turns: int = MAX_HISTORY_TURNS,
        ttl_sec: int = HISTORY_TTL_SEC,
        clock: Callable[[], float] = time.time,
        persist_path: str | None = None,
    ) -> None:
        self.max_turns = max_turns
        self.ttl_sec = ttl_sec
        self._clock = clock
        self._persist_path = Path(persist_path) if persist_path else None
        self._store: dict[str, dict[str, Any]] = {}
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            raw = json.loads(self._persist_path.read_text(encoding="utf-8"))
        except Exception:
            return
        if not isinstance(raw, dict):
            return
        now = self._clock()
        for cid, entry in raw.items():
            if not isinstance(entry, dict):
                continue
            ts = float(entry.get("ts") or 0)
            if now - ts > self.ttl_sec:
                continue
            turns = entry.get("turns") if isinstance(entry.get("turns"), list) else []
            slots = entry.get("slots") if isinstance(entry.get("slots"), dict) else {}
            self._store[str(cid)] = {
                "ts": ts,
                "turns": [
                    {"q": str(t.get("q", "")), "a": str(t.get("a", ""))}
                    for t in turns[-self.max_turns :]
                    if isinstance(t, dict)
                ],
                "slots": {k: slots[k] for k in SLOT_KEYS if k in slots and slots[k] not in (None, "")},
            }

    def _save_to_disk(self) -> None:
        if not self._persist_path:
            return
        try:
            _atomic_write_json(self._persist_path, self._store)
        except Exception:
            pass

    def _get_fresh_entry(self, chat_id: str) -> dict[str, Any] | None:
        if not chat_id or chat_id not in self._store:
            return None
        entry = self._store[chat_id]
        if self._clock() - float(entry.get("ts") or 0) > self.ttl_sec:
            del self._store[chat_id]
            self._save_to_disk()
            return None
        return entry

    def get_history(self, chat_id: str) -> list[dict[str, str]]:
        entry = self._get_fresh_entry(chat_id)
        return list(entry["turns"]) if entry else []

    def get_slots(self, chat_id: str) -> dict[str, Any]:
        entry = self._get_fresh_entry(chat_id)
        return dict(entry["slots"]) if entry else {}

    def append_turn(
        self,
        chat_id: str,
        question: str,
        answer: str,
        slots: dict[str, Any] | None = None,
    ) -> None:
        if not chat_id:
            return
        existing = self._get_fresh_entry(chat_id)
        turns = list(existing["turns"]) if existing else []
        merged_slots = dict(existing["slots"]) if existing else {}

        turns.append({
            "q": plain_snippet(question, limit=300),
            "a": plain_snippet(answer, limit=500),
        })
        if len(turns) > self.max_turns:
            turns = turns[-self.max_turns :]

        if isinstance(slots, dict):
            for k in SLOT_KEYS:
                if k in slots:
                    if slots[k] in (None, ""):
                        merged_slots.pop(k, None)
                    else:
                        merged_slots[k] = slots[k]

        self._store[chat_id] = {
            "ts": self._clock(),
            "turns": turns,
            "slots": merged_slots,
        }
        self._save_to_disk()

    def clear(self, chat_id: str) -> None:
        if chat_id and chat_id in self._store:
            self._store.pop(chat_id, None)
            self._save_to_disk()


def _empty_bucket() -> dict[str, Any]:
    return {
        "local_zero_token": 0,
        "blocked_zero_token": 0,
        "gemini_calls": 0,
        "gemini_api_requests": 0,
        "gemini_prompt_tokens": 0,
        "gemini_output_tokens": 0,
        "gemini_total_tokens": 0,
    }


def _fmt_num(n: Any) -> str:
    try:
        return f"{int(n or 0):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


class TelemetryStore:
    """Tracks 0-token vs Gemini usage counters, Pacific reset cycles, errors, and 7-day rolling Q&A logs."""

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
    ) -> None:
        now = (now_dt or vn_now()).astimezone(VN_TZ)
        day_key = now.date().isoformat()
        pac_key = google_quota_reset_info(now)["pacific_date"]
        month_key = now.strftime("%Y-%m")
        req_inc = max(1, int(api_requests)) if route == "gemini" else 0

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

    def format_token_report(
        self,
        project_name: str = "Ăn Vặt Tran",
        now_dt: dt.datetime | None = None,
        cfg: dict[str, str] | None = None,
        live_probe: dict[str, Any] | None = None,
    ) -> str:
        now = (now_dt or vn_now()).astimezone(VN_TZ)
        reset_info = google_quota_reset_info(now)
        day_b = self._stats["days"].get(now.date().isoformat()) or _empty_bucket()
        pac_b = self._stats["pacific_days"].get(reset_info["pacific_date"]) or _empty_bucket()
        if int(pac_b.get("gemini_calls", 0) or 0) == 0 and int(day_b.get("gemini_calls", 0) or 0) > 0 and reset_info["pacific_date"] == now.date().isoformat():
            pac_b = day_b
        mon_b = self._stats["months"].get(now.strftime("%Y-%m")) or _empty_bucket()

        def summarize(b: dict[str, Any]) -> tuple[int, int, int]:
            zero_total = int(b.get("local_zero_token", 0) or 0) + int(b.get("blocked_zero_token", 0) or 0)
            gem = int(b.get("gemini_calls", 0) or 0)
            total_reqs = zero_total + gem
            pct_zero = round(zero_total * 100 / total_reqs) if total_reqs > 0 else 100
            return zero_total, gem, pct_zero

        d_zero, d_gem, d_pct = summarize(day_b)
        m_zero, m_gem, m_pct = summarize(mon_b)

        cfg_eff = cfg or {}
        tier_name = (cfg_eff.get("gemini_tier_name") or "Free Tier").strip()
        rpd_raw = str(cfg_eff.get("gemini_rpd_limit") or "500")
        rpm_raw = str(cfg_eff.get("gemini_rpm_limit") or "15")
        tpm_raw = str(cfg_eff.get("gemini_tpm_limit") or "250000")
        rpd_limit = int(rpd_raw) if rpd_raw.isdigit() and int(rpd_raw) > 0 else 500
        rpm_limit = int(rpm_raw) if rpm_raw.isdigit() and int(rpm_raw) > 0 else 15
        tpm_limit = int(tpm_raw) if tpm_raw.isdigit() and int(tpm_raw) > 0 else 250000
        tpm_label = f"{tpm_limit // 1000}K" if tpm_limit >= 1000 else str(tpm_limit)

        primary_model = cfg_eff.get("gemini_model") or "gemini-3.5-flash-lite"
        status_line = "• 🟢 <b>Hoạt động bình thường</b> — AI sẵn sàng trả lời"
        if live_probe is not None:
            if not live_probe.get("configured"):
                status_line = "• 🔴 <b>Chưa gắn API Key Gemini</b>"
            elif not live_probe.get("key_valid"):
                status_line = "• 🔴 <b>Key lỗi hoặc bị từ chối</b> — Cần kiểm tra lại trên AI Studio"
            else:
                models = live_probe.get("models") or []
                p_m = next((m for m in models if m.get("role") == "Chính"), None)
                f_m = next((m for m in models if m.get("role") == "Dự phòng"), None)
                if p_m and not p_m.get("ok"):
                    code = p_m.get("status_code") or "ERR"
                    if f_m and f_m.get("ok"):
                        status_line = f"• 🟠 <b>Model chính tạm nghẽn (HTTP {code})</b> — Đang tự chạy sang bản dự phòng"
                    else:
                        status_line = f"• 🔴 <b>Cảnh báo (HTTP {code}):</b> {html.escape(str(p_m.get('error', ''))[:100])}"
                else:
                    status_line = f"• 🟢 <b>Hoạt động bình thường</b> — Sẵn sàng trả lời (<code>{html.escape(primary_model)}</code> + dự phòng)"

        pac_calls = int(pac_b.get("gemini_calls", 0) or 0)
        used_reqs = max(pac_calls, int(pac_b.get("gemini_api_requests") or 0))
        rem_reqs = max(0, rpd_limit - used_reqs)
        pac_tok = int(pac_b.get("gemini_total_tokens", 0) or 0)
        est_low = max(0, rem_reqs // 3)
        est_high = max(0, rem_reqs // 2)

        lines = [
            f"🤖 <b>[{html.escape(project_name)}] TÌNH TRẠNG AI &amp; HẠN MỨC HÔM NAY</b>",
            f"🗓 {now.strftime('%H:%M · %d/%m/%Y')} · Gói: <b>{html.escape(tier_name)} ({_fmt_num(rpd_limit)} lượt API/ngày)</b>",
            "────────────────",
            "<b>1. Trạng thái hiện tại</b>",
            status_line,
        ]

        last_err = self._stats.get("last_gemini_error")
        if last_err:
            lines.append(
                f"• ⚠️ Sự cố gần nhất ({html.escape(str(last_err.get('at', '')))}): "
                f"HTTP {last_err.get('code', 0)} — <i>{html.escape(str(last_err.get('message', ''))[:95])}</i>"
            )

        lines.extend([
            "",
            "<b>2. Còn hỏi Gemini được bao nhiêu hôm nay?</b>",
            f"• Đã dùng hôm nay: <b>{_fmt_num(used_reqs)} / {_fmt_num(rpd_limit)} lượt gọi API</b> ({_fmt_num(pac_tok)} token)",
            f"• <b>Còn lại: ~{_fmt_num(rem_reqs)} / {_fmt_num(rpd_limit)} lượt API</b> (hỏi thêm được khoảng <b>~{est_low}–{est_high} câu AI</b>)",
        ])

        tok_budget_raw = str(cfg_eff.get("gemini_daily_token_budget") or "")
        if tok_budget_raw.isdigit() and int(tok_budget_raw) > 0:
            bud = int(tok_budget_raw)
            rem_tok = max(0, bud - pac_tok)
            lines.append(f"• Ngân sách Token ngày đặt riêng: còn <b>{_fmt_num(rem_tok)} / {_fmt_num(bud)} token</b>")

        lines.extend([
            "• 💡 <i>Mọi câu xử lý ⚡ 0-token (lệnh, số liệu, món bán chạy...) thì hỏi thoải mái, <b>không giới hạn số lần</b>.</i>",
            f"• ⏳ Tự reset về 0 sau: <b>{reset_info['countdown_str']}</b> (vào <b>{reset_info['reset_vn_str']}</b>)",
            f"• ⚡ Giới hạn nhanh theo phút: tối đa <b>{rpm_limit} lượt/phút</b> · <b>{tpm_label} token/phút</b> (nếu vượt chỉ cần đợi 60 giây)",
            "",
            "<b>3. Hiệu quả tiết kiệm token của Bot</b>",
            f"• Hôm nay: <b>{d_zero} câu miễn phí 0-token</b> · <b>{d_gem} câu Gemini</b> → <b>Tiết kiệm {d_pct}%</b>",
            f"• Tháng {now.strftime('%m/%Y')}: <b>{m_zero} câu miễn phí</b> · <b>{m_gem} câu Gemini</b> ({_fmt_num(mon_b.get('gemini_total_tokens', 0))} token) → <b>Tiết kiệm {m_pct}%</b>",
        ])

        recent = self._stats.get("recent_gemini") or []
        if recent:
            lines.extend(["", "<b>Các câu gần đây có gọi Gemini:</b>"])
            for item in reversed(recent[-3:]):
                lines.append(
                    f"• [{html.escape(str(item.get('at', '')))}] <i>{html.escape(str(item.get('q', '')))}</i> ({_fmt_num(item.get('tokens', 0))} tok)"
                )

        lines.append(
            f"\n<i>* Số còn lại ước tính theo gói {html.escape(tier_name)} ({_fmt_num(rpd_limit)} lượt/ngày) từ lượt Bot gọi API; "
            "nếu dùng chung Key ở nơi khác xem chính xác tại</i> <code>aistudio.google.com/rate-limit</code>."
        )
        return "\n".join(lines)
