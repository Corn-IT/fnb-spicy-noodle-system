"""Group member and @username auto-registry with privacy-safe ID resolution."""

from __future__ import annotations

import html
import json
import re
import time
from pathlib import Path
from typing import Any

from ..core.telegram_io import tg_api
from ..core.vi_text import strip_vi, vn_now
from .telemetry_reports import _atomic_write_json

class TelegramMemberDirectory:
    """
    Zero-config persistent Telegram group member directory for auto-tagging people by display name.
    Learns automatically from Telegram getChatAdministrators, incoming senders, replies, and text_mention entities.
    """

    def __init__(
        self,
        persist_path: str | None = None,
        refresh_interval_sec: int = 300,
    ) -> None:
        self._path = Path(persist_path) if persist_path else None
        self._refresh_interval_sec = refresh_interval_sec
        self._last_admin_sync = 0.0
        self._members: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self._path or not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return
        if isinstance(raw, dict):
            for uid, entry in raw.items():
                if isinstance(entry, dict) and entry.get("mention_html"):
                    self._members[str(uid)] = entry

    def _save(self) -> None:
        if not self._path:
            return
        try:
            _atomic_write_json(self._path, self._members)
        except Exception:
            pass

    def observe_user(self, user: dict[str, Any] | None, custom_title: str = "") -> bool:
        if not isinstance(user, dict) or user.get("is_bot"):
            return False
        uid = user.get("id")
        if not isinstance(uid, int) or uid <= 0 or uid == 1087968824:
            return False

        first = str(user.get("first_name") or "").strip()
        last = str(user.get("last_name") or "").strip()
        full = " ".join(p for p in (first, last) if p).strip()
        username = str(user.get("username") or "").strip().lstrip("@")
        if username and re.fullmatch(r"[A-Za-z0-9_]{3,64}", username):
            mention_html = f"@{username}"
        else:
            disp = full or f"Thành viên #{uid}"
            mention_html = f'<a href="tg://user?id={uid}">{html.escape(disp)}</a>'

        key = str(uid)
        entry = {
            "id": uid,
            "username": username,
            "first_name": first,
            "last_name": last,
            "full_name": full,
            "custom_title": (custom_title or str((self._members.get(key) or {}).get("custom_title") or "")).strip(),
            "mention_html": mention_html,
        }
        if self._members.get(key) == entry:
            return False
        self._members[key] = entry
        return True

    def observe_message(self, msg: dict[str, Any] | None) -> None:
        if not isinstance(msg, dict):
            return
        changed = False
        if self.observe_user(msg.get("from")):
            changed = True
        reply = msg.get("reply_to_message")
        if isinstance(reply, dict) and self.observe_user(reply.get("from")):
            changed = True
        for nm in msg.get("new_chat_members") or []:
            if self.observe_user(nm):
                changed = True
        for ent in msg.get("entities") or []:
            if isinstance(ent, dict) and ent.get("type") == "text_mention":
                if self.observe_user(ent.get("user")):
                    changed = True
        if changed:
            self._save()

    def refresh_admins(self, bot_token: str, chat_id: str, force: bool = False) -> None:
        if not bot_token or not chat_id:
            return
        now = time.monotonic()
        if not force and (now - self._last_admin_sync) < self._refresh_interval_sec:
            return
        self._last_admin_sync = now
        try:
            resp = tg_api(bot_token, "getChatAdministrators", {"chat_id": chat_id}, timeout=5)
            if not resp.get("ok"):
                return
            changed = False
            for member in resp.get("result") or []:
                if not isinstance(member, dict):
                    continue
                if self.observe_user(member.get("user"), custom_title=str(member.get("custom_title") or "")):
                    changed = True
            if changed:
                self._save()
        except Exception:
            pass

    def build_alias_maps(self) -> tuple[dict[str, str], dict[str, str]]:
        """
        Return (multiword_and_username_aliases, unique_short_given_name_aliases).
        - Multi-word full names (e.g. 'thanh loan', 'minh tuan') match reliably under tag cues.
        - Single-word short names (e.g. 'loan', 'tuan') are returned separately so callers require
          an explicit tag/honorific prefix ('tag loan', 'chi loan', 'anh tuan') to avoid false matches.
        """
        exact: dict[str, str] = {}
        token_owners: dict[str, list[str]] = {}
        stop_short = {
            "anh", "chi", "em", "ban", "sep", "admin", "dev", "pos", "bu", "huy", "van", "thi",
            "nay", "mai", "tuan", "ngay", "thang", "nam", "tien", "don", "mon", "gio", "cho",
        }

        for m in self._members.values():
            mention = str(m.get("mention_html") or "")
            if not mention:
                continue
            uname = strip_vi(str(m.get("username") or ""))
            if uname and len(uname) >= 4:
                exact[uname] = mention

            full = strip_vi(str(m.get("full_name") or ""))
            first = strip_vi(str(m.get("first_name") or ""))
            last = strip_vi(str(m.get("last_name") or ""))

            # Also clean suffix notes like "Minh Tuấn - BU Huy - Dev" -> "Minh Tuấn"
            clean_head = strip_vi(re.split(r"\s*[-–|(]\s*", str(m.get("full_name") or ""), maxsplit=1)[0])
            for phrase in (full, clean_head, f"{first} {last}".strip()):
                words = [w for w in phrase.split() if len(w) >= 2]
                if len(words) >= 2:
                    exact[" ".join(words)] = mention

            for tok in re.findall(r"[a-z]{3,}", clean_head or full):
                if tok not in stop_short or tok in (last.lower(),):
                    token_owners.setdefault(tok, []).append(mention)

        unique_short: dict[str, str] = {}
        for tok, owners in token_owners.items():
            distinct = list(dict.fromkeys(owners))
            if len(distinct) == 1:
                unique_short[tok] = distinct[0]
        return exact, unique_short
