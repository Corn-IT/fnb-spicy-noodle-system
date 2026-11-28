#!/usr/bin/env python3
"""
Persistent Structured Conversation Context, 7-Day Rolling Q&A Audit Log,
and /token Telemetry Store for @POS_Lona_bot.
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

from biz_bot_common import vn_now

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
        "gemini_prompt_tokens": 0,
        "gemini_output_tokens": 0,
        "gemini_total_tokens": 0,
    }


class TelemetryStore:
    """Tracks 0-token vs Gemini usage counters and maintains a 7-day rolling Q&A log."""

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
        default_stats = {"days": {}, "months": {}, "recent_gemini": []}
        if not self._stats_path or not self._stats_path.exists():
            return default_stats
        try:
            loaded = json.loads(self._stats_path.read_text(encoding="utf-8"))
        except Exception:
            return default_stats
        if not isinstance(loaded, dict):
            return default_stats
        return {
            "days": loaded.get("days") if isinstance(loaded.get("days"), dict) else {},
            "months": loaded.get("months") if isinstance(loaded.get("months"), dict) else {},
            "recent_gemini": loaded.get("recent_gemini") if isinstance(loaded.get("recent_gemini"), list) else [],
        }

    def _prune_old_days(self, today: dt.date) -> None:
        cutoff = (today - dt.timedelta(days=35)).isoformat()
        self._stats["days"] = {k: v for k, v in self._stats["days"].items() if k >= cutoff}

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
    ) -> None:
        now = now_dt or vn_now()
        day_key = now.date().isoformat()
        month_key = now.strftime("%Y-%m")

        for bucket_map, key in ((self._stats["days"], day_key), (self._stats["months"], month_key)):
            b = bucket_map.setdefault(key, _empty_bucket())
            if route == "gemini":
                b["gemini_calls"] = int(b.get("gemini_calls", 0)) + 1
                b["gemini_prompt_tokens"] = int(b.get("gemini_prompt_tokens", 0)) + max(0, int(prompt_tokens))
                b["gemini_output_tokens"] = int(b.get("gemini_output_tokens", 0)) + max(0, int(output_tokens))
                b["gemini_total_tokens"] = int(b.get("gemini_total_tokens", 0)) + max(0, int(total_tokens))
            elif route == "guardrail_block" or is_refusal:
                b["blocked_zero_token"] = int(b.get("blocked_zero_token", 0)) + 1
            else:
                b["local_zero_token"] = int(b.get("local_zero_token", 0)) + 1

        if route == "gemini":
            recent = list(self._stats.get("recent_gemini") or [])
            recent.append({
                "at": now.strftime("%H:%M %d/%m"),
                "q": plain_snippet(question, limit=75),
                "tokens": max(0, int(total_tokens)),
            })
            self._stats["recent_gemini"] = recent[-5:]

        self._prune_old_days(now.date())
        if self._stats_path:
            try:
                _atomic_write_json(self._stats_path, self._stats)
            except Exception:
                pass

        if self._qa_log_path:
            self._append_qa_log({
                "ts": now.isoformat(timespec="seconds"),
                "msg_id": msg_id,
                "sender": plain_snippet(sender_label, limit=40),
                "route": route,
                "is_refusal": bool(is_refusal),
                "q": plain_snippet(question, limit=180),
                "a": plain_snippet(reply, limit=260),
                "tokens": max(0, int(total_tokens)),
            }, now.date())

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

    def format_token_report(self, project_name: str = "Ăn Vặt Tran", now_dt: dt.datetime | None = None) -> str:
        now = now_dt or vn_now()
        day_b = self._stats["days"].get(now.date().isoformat()) or _empty_bucket()
        mon_b = self._stats["months"].get(now.strftime("%Y-%m")) or _empty_bucket()

        def summarize(b: dict[str, Any]) -> tuple[int, int, int, str]:
            zero_ok = int(b.get("local_zero_token", 0))
            zero_blk = int(b.get("blocked_zero_token", 0))
            gem = int(b.get("gemini_calls", 0))
            total_reqs = zero_ok + zero_blk + gem
            pct_zero = (round((zero_ok + zero_blk) * 100 / total_reqs) if total_reqs > 0 else 100)
            tok_fmt = f"{int(b.get('gemini_total_tokens', 0)):,}".replace(",", ".")
            return zero_ok, zero_blk, gem, f"{pct_zero}% ({tok_fmt} token)"

        d_ok, d_blk, d_gem, d_meta = summarize(day_b)
        m_ok, m_blk, m_gem, m_meta = summarize(mon_b)

        lines = [
            f"🧮 <b>[{html.escape(project_name)}] THỐNG KÊ XỬ LÝ 0-TOKEN &amp; GEMINI</b>",
            f"🗓 Ngày <b>{now.strftime('%d/%m/%Y')}</b> · Tháng <b>{now.strftime('%m/%Y')}</b>",
            "────────────────",
            "<b>1. Hôm nay</b>",
            f"• ⚡ Cục bộ 0-token: <b>{d_ok} lượt</b> (từ chối/chặn 0-token: <b>{d_blk}</b>)",
            f"• 🤖 Gọi Gemini AI: <b>{d_gem} lượt</b> (Prompt {int(day_b.get('gemini_prompt_tokens', 0)):,} · Out {int(day_b.get('gemini_output_tokens', 0)):,})".replace(",", "."),
            f"• Tỷ lệ miễn phí 0-token: <b>{d_meta}</b>",
            "",
            f"<b>2. Lũy kế tháng {now.strftime('%m/%Y')}</b>",
            f"• ⚡ Cục bộ 0-token: <b>{m_ok} lượt</b> (từ chối/chặn 0-token: <b>{m_blk}</b>)",
            f"• 🤖 Gọi Gemini AI: <b>{m_gem} lượt</b>",
            f"• Tỷ lệ miễn phí 0-token: <b>{m_meta}</b>",
        ]

        recent = self._stats.get("recent_gemini") or []
        if recent:
            lines.extend(["", "<b>Các câu gần đây có gọi Gemini:</b>"])
            for item in reversed(recent[-3:]):
                lines.append(
                    f"• [{html.escape(str(item.get('at', '')))}] <i>{html.escape(str(item.get('q', '')))}</i> ({int(item.get('tokens', 0)):,} tok)".replace(",", ".")
                )

        lines.append("\n💡 <i>Gợi ý: Hỏi kèm tên Bot (<code>Lona</code>/<code>Bot</code>) hoặc Reply tin nhắn trước để giải ngữ cảnh 0-token.</i>")
        return "\n".join(lines)
