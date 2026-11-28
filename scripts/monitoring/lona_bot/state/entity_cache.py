"""In-memory 5-minute TTL cache of POS products & active staff for local matching."""

from __future__ import annotations

import time
from typing import Any

from ..core.internal_api import run_readonly_sql_json
from ..core.vi_text import strip_vi

ENTITY_CACHE_TTL_SEC = 300


class EntityCache:
    """5-minute TTL cache of products and active employees for 0-token entity matching."""

    def __init__(self, ttl_sec: int = ENTITY_CACHE_TTL_SEC) -> None:
        self.ttl_sec = ttl_sec
        self._products_at = 0.0
        self._products: list[dict[str, Any]] = []
        self._employees_at = 0.0
        self._employees: list[dict[str, Any]] = []

    def get_products(self, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
        now = time.monotonic()
        if self._products and now - self._products_at < self.ttl_sec:
            return self._products
        try:
            all_rows: list[dict[str, Any]] = []
            for offset in (0, 50, 100, 150, 200):
                batch = run_readonly_sql_json(
                    f"SELECT id, name, price, station, is_available FROM products ORDER BY id ASC OFFSET {offset}",
                    max_rows=50,
                    cfg=cfg,
                )
                all_rows.extend(batch)
                if len(batch) < 50:
                    break
        except Exception:
            return []
        for r in all_rows:
            r["_norm"] = strip_vi(str(r.get("name") or ""))
        all_rows.sort(key=lambda r: (-len(str(r.get("_norm") or "")), int(r.get("id") or 0)))
        self._products = all_rows
        self._products_at = now
        return self._products

    def get_employees(self, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
        now = time.monotonic()
        if self._employees and now - self._employees_at < self.ttl_sec:
            return self._employees
        try:
            rows = run_readonly_sql_json(
                """
                SELECT e.id, e.full_name, e.short_name, e.phone, e.bank_name, e.bank_account_no,
                       to_char(e.start_date, 'dd/mm/YYYY') AS start_vn,
                       COALESCE(mp.name, '') AS position_name,
                       COALESCE(ms.name, '') AS specialty_name
                FROM employees e
                LEFT JOIN v_bot_master_data mp ON mp.id = e.position_id
                LEFT JOIN v_bot_master_data ms ON ms.id = e.specialty_id
                WHERE e.is_deleted = FALSE
                ORDER BY e.id ASC
                """,
                max_rows=50,
                cfg=cfg,
            )
        except Exception:
            return []
        for r in rows:
            r["_norm_short"] = strip_vi(str(r.get("short_name") or ""))
            r["_norm_full"] = strip_vi(str(r.get("full_name") or ""))
        self._employees = rows
        self._employees_at = now
        return self._employees
