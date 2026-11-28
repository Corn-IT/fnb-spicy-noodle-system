"""Cashflow drawer, VietQR quotas, inventory imports, profit margin, HR schedules, and payroll reports."""
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

from .report_helpers import QR_STATUS_VI, SETTLEMENT_STATUS_VI, WEEKDAY_NAMES_VI, _fmt_growth, _overview, _proj

def handle_ket(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    cash = (data.get("kpis") or {}).get("cashDrawer") or {}
    trans = (data.get("kpis") or {}).get("transfer") or {}
    settlements_resp = call_internal_biz(
        "/internal/biz/cashflow/settlements",
        {"page": 1, "limit": 5, "fromDate": period["fromDate"], "toDate": period["toDate"]},
        cfg=cfg,
    )
    settlements = settlements_resp.get("items") or []

    lines = [
        f"💵 <b>[{_proj(cfg)}] ĐỐI SOÁT KÉT TIỀN MẶT</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        "<b>1. Công thức tiền két (Chuẩn thu ngân)</b>",
        f"• Tiền lẻ đầu ca: <b>{fmt_vnd(cash.get('openingBudget', 0))}</b>",
        f"• (+) Thu tiền mặt: <b>{fmt_vnd(cash.get('totalCashSales', 0))}</b> "
        f"(Thuần {fmt_vnd(cash.get('cashOnlySales', 0))} + Split {fmt_vnd(cash.get('splitCashSales', 0))})",
        f"• (−) Nhập hàng từ két: <b>{fmt_vnd(cash.get('totalCashImports', 0))}</b>",
        f"• (=) Két lý thuyết: <b>{fmt_vnd(cash.get('expectedCashInDrawer', 0))}</b>",
        f"• Tiền lãi bàn giao ước tính: <b>{fmt_vnd(cash.get('estimatedHandOver', 0))}</b>",
        f"• <i>(Chuyển khoản không vào két: {fmt_vnd(trans.get('totalTransferSales', 0))})</i>",
        "",
        "<b>2. Lịch sử chốt ca trong kỳ</b>",
    ]
    if settlements:
        for s in settlements:
            st_lbl = SETTLEMENT_STATUS_VI.get(s.get("status"), s.get("status", "—"))
            closer = html.escape(str(s.get("closedByName") or s.get("closedByUsername") or "—"))
            lines.append(
                f"• {fmt_short_date_vi(s['settlementDate'])} ({html.escape(s['shiftName'])}): "
                f"Thực đếm <b>{fmt_vnd(s['actualCountedCash'])}</b> · Lệch <b>{fmt_signed_vnd(s['discrepancyAmount'])}</b> "
                f"[{st_lbl}] ({closer})"
            )
    else:
        lines.append("• Chưa có bản ghi chốt ca trong kỳ này.")

    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_qr(cfg: dict[str, str] | None = None) -> str:
    _, data = _overview("today", cfg=cfg)
    accounts = data.get("paymentQrAccounts") or []
    lines = [
        f"🏦 <b>[{_proj(cfg)}] TÀI KHOẢN NGÂN HÀNG VIETQR</b>",
        "────────────────",
    ]
    if not accounts:
        lines.append("• Chưa cấu hình tài khoản ngân hàng QR nào.")
    else:
        for acc in accounts:
            st_lbl = QR_STATUS_VI.get(acc.get("status"), acc.get("status", "—"))
            acc_no = html.escape(str(acc.get("accountNo") or "****"))
            daily_lim = acc.get("dailyLimit")
            monthly_lim = acc.get("monthlyLimit")
            day_pct = f" ({round(acc['usedDay'] * 100 / daily_lim)}%)" if daily_lim else ""
            mon_pct = f" ({round(acc['usedMonth'] * 100 / monthly_lim)}%)" if monthly_lim else ""
            lines.append(
                f"• <b>{html.escape(str(acc['label']))}</b> ({html.escape(str(acc['bankCode']))} · <code>{acc_no}</code>) — {st_lbl}"
            )
            lines.append(
                f"  Hôm nay: <b>{fmt_vnd(acc.get('usedDay', 0))}</b>"
                + (f"/{fmt_vnd(daily_lim)}{day_pct}" if daily_lim else " (Không giới hạn)")
            )
            lines.append(
                f"  Tháng này: {fmt_vnd(acc.get('usedMonth', 0))}"
                + (f"/{fmt_vnd(monthly_lim)}{mon_pct}" if monthly_lim else "")
            )
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_kho(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    inv = (data.get("kpis") or {}).get("inventory") or {}
    recent = data.get("recentInventoryImports") or []

    top_items = run_readonly_sql_json(
        f"""
        SELECT item_name_snapshot AS name, unit_name, SUM(quantity) AS qty, SUM(total_cost) AS cost
        FROM inventory_imports
        WHERE is_deleted = FALSE
          AND import_date >= {_sql_quote(period['fromDate'])}::date
          AND import_date <= {_sql_quote(period['toDate'])}::date
        GROUP BY item_name_snapshot, unit_name
        ORDER BY cost DESC
        """,
        max_rows=5,
        cfg=cfg,
    )

    cost_pct = f"{inv['costToRevenuePercent']}%" if inv.get("costToRevenuePercent") is not None else "—"
    lines = [
        f"📦 <b>[{_proj(cfg)}] NHẬP KHO &amp; CHI PHÍ NGUYÊN LIỆU</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Tổng chi nhập hàng: <b>{fmt_vnd(inv.get('totalImportCost', 0))}</b> ({inv.get('importCount', 0)} phiếu · {cost_pct} doanh thu)",
        f"• Nguồn tiền: Từ két <b>{fmt_vnd(inv.get('cashDrawerImportCost', 0))}</b> · Tiền ngoài <b>{fmt_vnd(inv.get('externalImportCost', 0))}</b>",
    ]
    if top_items:
        lines.extend(["", "<b>Top nguyên liệu chi nhiều nhất:</b>"])
        for it in top_items:
            lines.append(
                f"• {html.escape(str(it['name']))} ({it['qty']} {html.escape(str(it['unit_name']))}): <b>{fmt_vnd(it['cost'])}</b>"
            )
    if recent:
        lines.extend(["", "<b>Phiếu nhập gần nhất:</b>"])
        for r in recent[:5]:
            src = "Két" if r.get("paymentSource") == "CASH_DRAWER" else "Ngoài"
            lines.append(
                f"• {fmt_short_date_vi(r['importDate'])}: {html.escape(str(r['itemName']))} — <b>{fmt_vnd(r['totalCost'])}</b> ({src})"
            )
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_lich(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    norm = strip_vi(arg)
    today = vn_today_date()
    if "tuantruoc" in norm.replace(" ", ""):
        ref_date = today - dt.timedelta(days=7)
    elif "tuansau" in norm.replace(" ", ""):
        ref_date = today + dt.timedelta(days=7)
    else:
        ref_date = today
    monday = ref_date - dt.timedelta(days=ref_date.weekday())
    show_full_week = any(k in norm for k in ("tuan", "week", "ca tuan"))

    week_data = call_internal_biz(
        "/internal/biz/schedule",
        {"weekStartDate": monday.isoformat()},
        cfg=cfg,
    )
    cells = week_data.get("cells") or []
    today_dow = today.weekday()

    staff_map = get_staff_telegram_map(cfg)

    def _fmt_emp(e: dict[str, Any]) -> str:
        raw_name = str(e.get("shortName") or e.get("fullName") or "")
        safe = html.escape(raw_name)
        handle = staff_map.get(strip_vi(raw_name))
        return f"{safe} ({html.escape(handle)})" if handle else safe

    if not show_full_week:
        day_cells = [c for c in cells if c.get("dayOfWeek") == today_dow and c.get("employees")]
        lines = [
            f"📅 <b>[{_proj(cfg)}] LỊCH TRỰC HÔM NAY ({WEEKDAY_NAMES_VI[today_dow]} · {fmt_short_date_vi(today.isoformat())})</b>",
            "────────────────",
        ]
        if not day_cells:
            lines.append("• Chưa xếp ca làm cho hôm nay.")
        else:
            for c in day_cells:
                emp_names = ", ".join(_fmt_emp(e) for e in c["employees"])
                lines.append(f"• <b>{html.escape(str(c['timeSlot']))}</b>: {emp_names}")
        lines.append(f"\n💡 <i>Xem cả tuần: gõ</i> <code>/lich tuan</code>")
        return "\n".join(lines)

    lines = [
        f"📅 <b>[{_proj(cfg)}] LỊCH LÀM TUẦN ({fmt_short_date_vi(monday.isoformat())}–{fmt_short_date_vi((monday + dt.timedelta(days=6)).isoformat())})</b>",
        "────────────────",
    ]
    for dow in range(7):
        day_cells = [c for c in cells if c.get("dayOfWeek") == dow and c.get("employees")]
        day_str = fmt_short_date_vi((monday + dt.timedelta(days=dow)).isoformat())
        if not day_cells:
            lines.append(f"• <b>{WEEKDAY_NAMES_VI[dow]} ({day_str})</b>: Chưa xếp")
            continue
        slots = [
            f"{html.escape(str(c['timeSlot']))}: {', '.join(_fmt_emp(e) for e in c['employees'])}"
            for c in day_cells
        ]
        lines.append(f"• <b>{WEEKDAY_NAMES_VI[dow]} ({day_str})</b>: " + " | ".join(slots))
    return "\n".join(lines)


def handle_luong(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period = parse_period_spec(arg or "thang")
    data = call_internal_biz(
        "/internal/biz/payroll",
        {"fromDate": period["fromDate"], "toDate": period["toDate"]},
        cfg=cfg,
    )
    summary = data.get("summary") or {}
    items = sorted(data.get("items") or [], key=lambda x: float(x.get("totalSalary", 0) or 0), reverse=True)

    lines = [
        f"👷 <b>[{_proj(cfg)}] TỔNG HỢP LƯƠNG NHÂN VIÊN</b>",
        f"🗓 Kỳ: <b>{fmt_short_date_vi(data['fromDate'])}–{fmt_date_vi(data['toDate'])}</b>",
        "────────────────",
        f"• Nhân sự: <b>{summary.get('totalEmployees', 0)} người</b>",
        f"• Tổng công Full: <b>{summary.get('totalFullShiftDays', 0)} ngày</b> · Giờ lẻ: <b>{summary.get('totalCustomHours', 0)} giờ</b>",
        f"• Tổng quỹ lương ước tính: <b>{fmt_vnd(summary.get('totalSalary', 0))}</b>",
        "",
        "<b>Chi tiết theo nhân viên:</b>",
    ]
    for row in items[:10]:
        sal = float(row.get("totalSalary", 0) or 0)
        if sal == 0 and len(items) > 6:
            continue
        lines.append(
            f"• <b>{html.escape(str(row['shortName']))}</b> ({row['fullShiftDays']}đ / {row['customHours']}h): <b>{fmt_vnd(sal)}</b>"
        )
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_loinhuan(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg or "thang", cfg=cfg)
    kpis = data.get("kpis") or {}
    rev = kpis.get("revenue") or {}
    inv = kpis.get("inventory") or {}
    profit = kpis.get("profit") or {}

    net_rev = float(rev.get("netPaidAmount", 0) or 0)
    inv_cost = float(inv.get("totalImportCost", 0) or 0)
    labor = profit.get("estimatedLaborCost")
    net_op = profit.get("netOperatingProfit")

    lines = [
        f"📈 <b>[{_proj(cfg)}] ƯỚC TÍNH LỢI NHUẬN</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Doanh thu thực thu: <b>{fmt_vnd(net_rev)}</b>",
        f"• (−) Chi nhập kho: <b>{fmt_vnd(inv_cost)}</b>",
        f"• (=) Lợi nhuận sau kho: <b>{fmt_vnd(profit.get('grossProfitAfterInventory', 0))}</b>",
    ]
    if labor is not None and net_op is not None:
        lines.append(f"• (−) Quỹ lương ước tính: <b>{fmt_vnd(labor)}</b>")
        lines.append(f"• (=) <b>Lợi nhuận vận hành: {fmt_vnd(net_op)}</b> (Biên {profit.get('marginPercent', 0)}%)")
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)
