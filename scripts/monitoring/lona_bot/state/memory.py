"""Short-term per-thread conversation memory and Gemini RPM/RPD rate limiter."""

from __future__ import annotations

import html
import json
import re
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable

from ..core.vi_text import strip_vi, vn_now
from .telemetry_reports import _atomic_write_json, plain_snippet

MAX_AI_PER_MINUTE = 28

MAX_HISTORY_TURNS = 4
HISTORY_TTL_SEC = 600

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
    "persona",
)


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
class AiRateLimiter:
    def __init__(self, max_per_min: int = MAX_AI_PER_MINUTE) -> None:
        self.max_per_min = max_per_min
        self._timestamps: list[float] = []

    def allow(self) -> bool:
        now = time.monotonic()
        self._timestamps = [t for t in self._timestamps if now - t < 60.0]
        if len(self._timestamps) >= self.max_per_min:
            return False
        self._timestamps.append(now)
        return True
