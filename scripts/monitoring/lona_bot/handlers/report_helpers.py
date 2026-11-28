"""Shared Vietnamese business labels and overview fetch helper."""
from __future__ import annotations

import datetime as dt
import html
import re
from typing import Any

from ..core.config import get_biz_config
from ..core.internal_api import call_internal_biz, get_staff_telegram_map, run_readonly_sql_json
from ..core.sql_guard import sql_quote as _sql_quote, vn_bounds_sql as _vn_bounds_sql
from ..core.vi_text import (
    fmt_date_vi,
    fmt_short_date_vi,
    fmt_signed_vnd,
    fmt_vnd,
    parse_period_spec,
    strip_vi,
    vn_now_str,
    vn_today_date,
)

STATION_NAMES_VI = {
    "BEP_NAU": "Bếp Nấu",
    "BEP_CHIEN": "Bếp Chiên",
    "PHA_CHE": "Quầy Pha Chế",
    "COMBO": "Combo",
}

SETTLEMENT_STATUS_VI = {
    "MATCHED": "✅ Khớp quỹ",
    "SURPLUS": "🟢 Dư tiền",
    "SHORTAGE": "🔴 Thiếu tiền",
}

QR_STATUS_VI = {
    "ACTIVE": "🟢 Hoạt động",
    "NEAR_LIMIT": "🟡 Sắp chạm hạn mức",
    "DAY_FULL": "🔴 Đầy hạn mức ngày",
    "MONTH_FULL": "🔴 Đầy hạn mức tháng",
    "YEAR_FULL": "🔴 Đầy hạn mức năm",
    "INACTIVE": "⚪ Tạm tắt",
}

WEEKDAY_NAMES_VI = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]


def _proj(cfg: dict[str, str] | None = None) -> str:
    return html.escape((cfg or get_biz_config())["project_name"])



def _fmt_growth(pct: float | None) -> str:
    if pct is None:
        return "—"
    arrow = "📈 +" if pct > 0 else ("📉 " if pct < 0 else "➖ ")
    return f"{arrow}{pct:.1f}%"


def _overview(period_spec: str | None = None, cfg: dict[str, str] | None = None) -> tuple[dict[str, str], dict[str, Any]]:
    period = parse_period_spec(period_spec)
    data = call_internal_biz(
        "/internal/biz/overview",
        {"preset": period["preset"], "fromDate": period["fromDate"], "toDate": period["toDate"]},
        cfg=cfg,
    )
    return period, data
