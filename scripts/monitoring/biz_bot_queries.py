#!/usr/bin/env python3
"""
Business statistics command handlers and report builders for @POS_Lona_bot.
Reuses NestJS loopback APIs (/internal/biz/*) as single source of truth and
falls back to strictly column-scoped read-only SQL (fnb_bot_ro) for detail lookups.
"""

from __future__ import annotations

import datetime as dt
import html
import re
from typing import Any

from biz_bot_common import (
    VN_TZ,
    call_internal_biz,
    fmt_date_vi,
    fmt_short_date_vi,
    fmt_signed_vnd,
    fmt_vnd,
    get_biz_config,
    get_staff_telegram_map,
    parse_period_spec,
    run_readonly_sql_json,
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


def _sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _vn_bounds_sql(from_date: str, to_date: str) -> tuple[str, str]:
    start_ts = f"{from_date} 00:00:00+07"
    end_d = dt.date.fromisoformat(to_date) + dt.timedelta(days=1)
    end_ts = f"{end_d.isoformat()} 00:00:00+07"
    return _sql_quote(start_ts), _sql_quote(end_ts)


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


def handle_tongquan(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    kpis = data.get("kpis") or {}
    rev = kpis.get("revenue") or {}
    cash = kpis.get("cashDrawer") or {}
    trans = kpis.get("transfer") or {}
    inv = kpis.get("inventory") or {}
    open_orders = kpis.get("openOrders") or {}
    profit = kpis.get("profit") or {}
    risk = data.get("discountsAndRisk") or {}
    alerts = data.get("alerts") or {}

    net_rev = rev.get("netPaidAmount", 0)
    orders_cnt = rev.get("paidOrderCount", 0)
    growth = _fmt_growth(rev.get("growthPercent"))

    lines = [
        f"📊 <b>[{_proj(cfg)}] TỔNG QUAN KINH DOANH</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        "<b>1. Doanh thu &amp; Đơn hàng</b>",
        f"• Thực thu: <b>{fmt_vnd(net_rev)}</b> ({growth})",
        f"• Đã thanh toán: <b>{orders_cnt} đơn</b> (Tại bàn {rev.get('dineInCount', 0)} · Mang về {rev.get('takeawayCount', 0)})",
        f"• TB/đơn: {fmt_vnd(rev.get('averageOrderValue', 0))} · Giảm giá: {fmt_vnd(rev.get('discountAmount', 0))}",
        "",
        "<b>2. Dòng tiền &amp; Két</b>",
        f"• Tiền mặt: <b>{fmt_vnd(cash.get('totalCashSales', 0))}</b> · Chuyển khoản: <b>{fmt_vnd(trans.get('totalTransferSales', 0))}</b>",
        f"• Két lý thuyết: <b>{fmt_vnd(cash.get('expectedCashInDrawer', 0))}</b> (Đầu ca {fmt_vnd(cash.get('openingBudget', 0))})",
        "",
        "<b>3. Chi phí &amp; Ước tính Lợi nhuận</b>",
        f"• Nhập kho: <b>{fmt_vnd(inv.get('totalImportCost', 0))}</b> (Từ két {fmt_vnd(inv.get('cashDrawerImportCost', 0))})",
        f"• Lợi nhuận sau kho: <b>{fmt_vnd(profit.get('grossProfitAfterInventory', 0))}</b>",
    ]
    if profit.get("netOperatingProfit") is not None:
        lines.append(
            f"• Sau trừ lương ({fmt_vnd(profit.get('estimatedLaborCost', 0))}): "
            f"<b>{fmt_vnd(profit.get('netOperatingProfit'))}</b> ({profit.get('marginPercent', 0)}%)"
        )

    if period["fromDate"] <= vn_today_date().isoformat() <= period["toDate"] and open_orders:
        lines.extend([
            "",
            "<b>4. Trực tiếp hiện tại</b>",
            f"• Bàn có khách: <b>{open_orders.get('occupiedTableCount', 0)}/{open_orders.get('totalPhysicalTables', 0)}</b>"
            f" · Chờ QR: <b>{open_orders.get('pendingTableCount', 0)}</b> · Mang về mở: <b>{open_orders.get('takeawayOpenCount', 0)}</b>",
            f"• Tiền bàn đang mở: <b>{fmt_vnd(open_orders.get('totalOpenAmount', 0))}</b>",
        ])

    alert_notes = []
    if alerts.get("pendingQrTables"):
        alert_notes.append(f"{len(alerts['pendingQrTables'])} đơn QR chờ duyệt")
    if alerts.get("pendingPaymentEdits"):
        alert_notes.append(f"{len(alerts['pendingPaymentEdits'])} yêu cầu sửa TT")
    if alerts.get("nearLimitQrAccounts"):
        alert_notes.append(f"{len(alerts['nearLimitQrAccounts'])} TK QR sắp/đầy hạn mức")
    if risk.get("voidedOrderCount", 0) > 0:
        alert_notes.append(f"{risk['voidedOrderCount']} đơn hủy")
    if alert_notes:
        lines.extend(["", f"⚠️ <b>Lưu ý:</b> {' · '.join(alert_notes)}"])

    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_ban(cfg: dict[str, str] | None = None) -> str:
    _, data = _overview("today", cfg=cfg)
    live = data.get("liveTables") or {}
    tables = live.get("tables") or []
    takeaways = live.get("takeaways") or []
    open_kpi = (data.get("kpis") or {}).get("openOrders") or {}

    busy_tables = [t for t in tables if t.get("status") != "AVAILABLE"]
    drafts = run_readonly_sql_json(
        "SELECT count(*) AS cnt FROM pos_drafts WHERE submitted_at IS NULL",
        max_rows=1,
        cfg=cfg,
    )
    draft_cnt = int((drafts[0] if drafts else {}).get("cnt", 0) or 0)

    lines = [
        f"🪑 <b>[{_proj(cfg)}] TRẠNG THÁI BÀN &amp; ĐƠN MỞ</b>",
        "────────────────",
        f"• Bàn đang có khách: <b>{open_kpi.get('occupiedTableCount', 0)}/{len(tables)}</b>"
        f" · QR chờ duyệt: <b>{open_kpi.get('pendingTableCount', 0)}</b>",
        f"• Mang về đang mở: <b>{len(takeaways)}</b> · Nháp POS: <b>{draft_cnt}</b>",
        f"• Món chờ in bếp: <b>{open_kpi.get('unprintedKitchenItemsCount', 0)}</b> · Tổng tạm tính: <b>{fmt_vnd(open_kpi.get('totalOpenAmount', 0))}</b>",
    ]

    if busy_tables:
        lines.extend(["", "<b>Chi tiết bàn đang phục vụ:</b>"])
        for t in busy_tables[:15]:
            ao = t.get("activeOrder") or {}
            icon = "🟡" if t.get("status") == "PENDING" else "🔴"
            code = html.escape(str(ao.get("orderCode") or ""))
            amt = fmt_vnd(ao.get("totalAmount", 0))
            lines.append(f"• {icon} <b>{html.escape(t['name'])}</b>: {amt} (<code>{code}</code>)")
        if len(busy_tables) > 15:
            lines.append(f"• <i>…và {len(busy_tables) - 15} bàn khác</i>")
    else:
        lines.append("\n✅ Hiện tất cả các bàn đều đang trống.")

    if takeaways:
        lines.extend(["", "<b>Đơn Mang về đang mở:</b>"])
        for tw in takeaways[:8]:
            lbl = html.escape(str(tw.get("tableLabel") or tw.get("orderCode") or "Mang về"))
            lines.append(f"• 🛍 <b>{lbl}</b>: {fmt_vnd(tw.get('totalAmount', 0))} (<code>{html.escape(str(tw.get('orderCode', '')))}</code>)")

    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def _lookup_order_detail(raw_code: str, cfg: dict[str, str] | None = None) -> str:
    code = re.sub(r"[^A-Za-z0-9_-]", "", raw_code.strip().lstrip("#")).upper()
    if not code:
        return "⚠️ Mã đơn không hợp lệ."

    where_clause = f"o.id = {int(code)}" if code.isdigit() else f"UPPER(o.order_code) = {_sql_quote(code)}"
    orders = run_readonly_sql_json(
        f"""
        SELECT
          o.id, o.order_code, o.order_type, o.order_source, o.status,
          o.payment_method, o.subtotal_amount, o.discount_amount, o.total_amount,
          o.cash_amount, o.transfer_amount, o.void_reason, o.note,
          o.takeaway_number, dt.name AS table_name,
          COALESCE(e.short_name, u.username, '—') AS cashier_name,
          to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm/YYYY') AS created_vn,
          to_char(o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm/YYYY') AS paid_vn
        FROM orders o
        LEFT JOIN dining_tables dt ON dt.id = o.table_id
        LEFT JOIN users u ON u.id = o.cashier_id
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE {where_clause}
        ORDER BY o.id DESC
        """,
        max_rows=1,
        cfg=cfg,
    )
    if not orders:
        return f"🔎 Không tìm thấy đơn hàng có mã <code>{html.escape(code)}</code>."

    ord_row = orders[0]
    items = run_readonly_sql_json(
        f"""
        SELECT p.name AS product_name, oi.quantity, oi.unit_price, oi.kitchen_status, oi.item_note
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = {int(ord_row['id'])}
        ORDER BY oi.batch_no ASC, oi.id ASC
        """,
        max_rows=30,
        cfg=cfg,
    )
    target = ord_row.get("table_name") or (f"Mang về #{ord_row['takeaway_number']}" if ord_row.get("takeaway_number") else "Mang về")
    lines = [
        f"🧾 <b>[{_proj(cfg)}] CHI TIẾT ĐƠN {html.escape(str(ord_row['order_code']))}</b>",
        "────────────────",
        f"• Trạng thái: <b>{html.escape(str(ord_row['status']))}</b> · {html.escape(str(target))}",
        f"• Nguồn: {html.escape(str(ord_row['order_source']))} · Thu ngân: {html.escape(str(ord_row['cashier_name']))}",
        f"• Tạo lúc: {html.escape(str(ord_row['created_vn']))}" + (f" · TT: {html.escape(str(ord_row['paid_vn']))}" if ord_row.get("paid_vn") else ""),
        f"• Thanh toán: <b>{html.escape(str(ord_row.get('payment_method') or 'Chưa TT'))}</b>",
        f"• Tạm tính: {fmt_vnd(ord_row['subtotal_amount'])} · Giảm: {fmt_vnd(ord_row['discount_amount'])} · Thực thu: <b>{fmt_vnd(ord_row['total_amount'])}</b>",
    ]
    if ord_row.get("void_reason"):
        lines.append(f"• Lý do hủy: <i>{html.escape(str(ord_row['void_reason']))}</i>")
    if items:
        lines.extend(["", "<b>Danh sách món:</b>"])
        for it in items[:20]:
            st_flag = " ❌HỦY" if it.get("kitchen_status") == "CANCELLED" else ""
            lines.append(f"• {it['quantity']}x {html.escape(str(it['product_name']))} ({fmt_vnd(it['unit_price'])}){st_flag}")
    return "\n".join(lines)


def handle_don(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    clean_arg = (arg or "").strip()
    if clean_arg and (
        re.match(r"^(?:HD|ORD)-", clean_arg, re.I)
        or re.fullmatch(r"#?\d+", clean_arg)
    ):
        return _lookup_order_detail(clean_arg, cfg=cfg)

    period = parse_period_spec(clean_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
    summary_rows = run_readonly_sql_json(
        f"""
        SELECT
          count(*) AS total_orders,
          count(*) FILTER (WHERE status = 'PAID') AS paid_count,
          count(*) FILTER (WHERE status IN ('PENDING', 'SERVING')) AS open_count,
          count(*) FILTER (WHERE status = 'VOIDED') AS voided_count,
          count(*) FILTER (WHERE status = 'PAID' AND order_type = 'DINE_IN') AS dine_in_paid,
          count(*) FILTER (WHERE status = 'PAID' AND order_type = 'TAKEAWAY') AS takeaway_paid,
          count(*) FILTER (WHERE status = 'PAID' AND order_source = 'QR_CODE') AS qr_paid,
          count(*) FILTER (WHERE status = 'PAID' AND order_source = 'POS_COUNTER') AS pos_paid,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0) AS paid_revenue
        FROM orders
        WHERE created_at >= {start_sql} AND created_at < {end_sql}
        """,
        max_rows=1,
        cfg=cfg,
    )
    row = summary_rows[0] if summary_rows else {}
    paid_cnt = int(row.get("paid_count", 0) or 0)
    paid_rev = float(row.get("paid_revenue", 0) or 0)
    avg_val = (paid_rev / paid_cnt) if paid_cnt > 0 else 0

    recent_rows = run_readonly_sql_json(
        f"""
        SELECT
          o.order_code, o.status, o.total_amount, o.order_type, o.takeaway_number,
          dt.name AS table_name,
          to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm') AS created_hm
        FROM orders o
        LEFT JOIN dining_tables dt ON dt.id = o.table_id
        WHERE o.created_at >= {start_sql} AND o.created_at < {end_sql}
        ORDER BY o.created_at DESC, o.id DESC
        """,
        max_rows=5,
        cfg=cfg,
    )

    lines = [
        f"🧾 <b>[{_proj(cfg)}] THỐNG KÊ ĐƠN HÀNG</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Tổng đơn tạo: <b>{row.get('total_orders', 0)} đơn</b>",
        f"• Đã thanh toán: <b>{paid_cnt}</b> · Đang mở: <b>{row.get('open_count', 0)}</b> · Đã hủy: <b>{row.get('voided_count', 0)}</b>",
        f"• Loại đơn (đã TT): Tại bàn <b>{row.get('dine_in_paid', 0)}</b> · Mang về <b>{row.get('takeaway_paid', 0)}</b>",
        f"• Nguồn (đã TT): POS quầy <b>{row.get('pos_paid', 0)}</b> · Khách QR <b>{row.get('qr_paid', 0)}</b>",
        f"• Tổng thu: <b>{fmt_vnd(paid_rev)}</b> · TB/đơn: <b>{fmt_vnd(avg_val)}</b>",
    ]
    if recent_rows:
        lines.extend(["", "<b>5 đơn gần nhất trong kỳ:</b>"])
        for r in recent_rows:
            loc = r.get("table_name") or (f"Mang về #{r['takeaway_number']}" if r.get("takeaway_number") else "Mang về")
            lines.append(
                f"• <code>{html.escape(str(r['order_code']))}</code> ({html.escape(str(loc))}) — "
                f"<b>{fmt_vnd(r['total_amount'])}</b> [{html.escape(str(r['status']))}] {html.escape(str(r['created_hm']))}"
            )
    lines.append(f"\n💡 <i>Xem chi tiết đơn: gõ</i> <code>/don MÃ_ĐƠN</code>")
    return "\n".join(lines)


def handle_doanhthu(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    kpis = data.get("kpis") or {}
    rev = kpis.get("revenue") or {}
    breakdown = data.get("paymentBreakdown") or []
    series = data.get("revenueSeries") or {}

    method_labels = {"CASH": "Tiền mặt", "TRANSFER": "Chuyển khoản", "SPLIT": "Kết hợp (Split)"}
    lines = [
        f"💰 <b>[{_proj(cfg)}] BÁO CÁO DOANH THU</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        "<b>1. Tổng hợp doanh thu</b>",
        f"• Thực thu: <b>{fmt_vnd(rev.get('netPaidAmount', 0))}</b> ({_fmt_growth(rev.get('growthPercent'))})",
        f"• Tạm tính: {fmt_vnd(rev.get('subtotalAmount', 0))} · Giảm giá: {fmt_vnd(rev.get('discountAmount', 0))}",
        f"• Số đơn: <b>{rev.get('paidOrderCount', 0)}</b> · Giá trị TB: <b>{fmt_vnd(rev.get('averageOrderValue', 0))}</b>",
        "",
        "<b>2. Cơ cấu thanh toán</b>",
    ]
    for item in breakdown:
        m_lbl = method_labels.get(item.get("method"), item.get("method", "—"))
        lines.append(
            f"• {m_lbl}: <b>{fmt_vnd(item.get('totalAmount', 0))}</b> "
            f"({item.get('orderCount', 0)} đơn · {item.get('sharePercent', 0)}%)"
        )

    buckets = [b for b in (series.get("buckets") or []) if b.get("orderCount", 0) > 0]
    if buckets:
        unit = "khung giờ" if series.get("granularity") == "hour" else "ngày"
        lines.extend(["", f"<b>3. Phân bổ theo {unit}</b>"])
        if series.get("peakBucketLabel"):
            lines.append(
                f"• Cao điểm: <b>{html.escape(str(series['peakBucketLabel']))}</b> "
                f"({fmt_vnd(series.get('peakBucketAmount', 0))} · {series.get('peakBucketOrders', 0)} đơn)"
            )
        for b in buckets[:12]:
            lines.append(f"• {html.escape(str(b['label']))}: <b>{fmt_vnd(b['totalSales'])}</b> ({b['orderCount']} đơn)")

    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


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


def handle_topmon(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    norm = strip_vi(arg)
    slow_mode = any(k in norm for k in ("cham", "it", "khong ban", "e "))
    period_raw = re.sub(r"\b(?:cham|it|e)\b", "", norm).strip()
    period = parse_period_spec(period_raw)

    if slow_mode:
        start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
        rows = run_readonly_sql_json(
            f"""
            SELECT
              p.name,
              p.station,
              p.price,
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID' AND oi.kitchen_status <> 'CANCELLED' AND o.paid_at >= {start_sql} AND o.paid_at < {end_sql}), 0) AS qty_sold
            FROM products p
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON o.id = oi.order_id
            WHERE p.is_available = TRUE
            GROUP BY p.id, p.name, p.station, p.price
            ORDER BY qty_sold ASC, p.name ASC
            """,
            max_rows=12,
            cfg=cfg,
        )
        lines = [
            f"🐢 <b>[{_proj(cfg)}] TOP MÓN BÁN CHẬM</b>",
            f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
            "────────────────",
        ]
        if rows:
            lines.append(
                f"• Chậm nhất: <b>{html.escape(str(rows[0]['name']))}</b> ({rows[0]['qty_sold']} phần)"
            )
            lines.append("")
        for idx, r in enumerate(rows, 1):
            st = STATION_NAMES_VI.get(r.get("station", ""), r.get("station", ""))
            lines.append(f"{idx}. {html.escape(str(r['name']))} ({st}) — <b>{r['qty_sold']} phần</b> ({fmt_vnd(r['price'])})")
        lines.append(f"🕒 Lúc: {vn_now_str()}")
        return "\n".join(lines)

    daily = call_internal_biz(
        "/internal/biz/daily-items",
        {"preset": period["preset"], "fromDate": period["fromDate"], "toDate": period["toDate"]},
        cfg=cfg,
    )
    _, overview = _overview(period_raw, cfg=cfg)
    summary = daily.get("summary") or {}
    items = (daily.get("items") or [])[:10]
    top_mods = ((overview.get("topProducts") or {}).get("topModifiers") or [])[:5]

    lines = [
        f"🔥 <b>[{_proj(cfg)}] TOP MÓN BÁN CHẠY</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Đã bán: <b>{summary.get('totalQuantity', 0)} phần</b> ({summary.get('totalProductsSold', 0)} món / {summary.get('totalOrders', 0)} đơn)",
    ]
    if items:
        top1 = items[0]
        lines.append(
            f"• 🏆 Bán chạy nhất: <b>{html.escape(str(top1['name']))}</b> ({top1['qty']} phần · {fmt_vnd(top1['revenue'])})"
        )
    lines.append("")
    if items:
        for idx, it in enumerate(items, 1):
            lines.append(
                f"{idx}. <b>{html.escape(str(it['name']))}</b> — "
                f"<b>{it['qty']} phần</b> · {fmt_vnd(it['revenue'])} ({it.get('sharePercent', 0)}%)"
            )
    else:
        lines.append("• Chưa có món nào bán ra trong kỳ này.")

    if top_mods:
        lines.extend(["", "<b>Top topping / tùy chọn thu thêm:</b>"])
        for m in top_mods:
            lines.append(f"• {html.escape(str(m['name']))}: {m['qty']} lượt (+{fmt_vnd(m['revenue'])})")

    lines.append(f"\n💡 <i>Xem món bán chậm: gõ</i> <code>/topmon cham</code>")
    return "\n".join(lines)


def handle_bep(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    ks = data.get("kitchenStations") or {}
    stations = ks.get("stations") or []
    spices = [s for s in (ks.get("spiceLevels") or []) if s.get("count", 0) > 0]

    lines = [
        f"🍳 <b>[{_proj(cfg)}] SẢN LƯỢNG TRẠM BẾP</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Combo đã phân rã xuống bếp: <b>{ks.get('comboDecomposedCount', 0)} phần</b>",
        "",
    ]
    for st in stations:
        name = html.escape(str(st.get("label") or st.get("station")))
        lines.append(
            f"• <b>{name}</b>: <b>{st.get('printedQty', 0)} phần</b> ({fmt_vnd(st.get('revenue', 0))} · {st.get('sharePercent', 0)}%)"
            f" · Chờ in {st.get('pendingQty', 0)} · Hủy {st.get('cancelledQty', 0)}"
        )

    if spices:
        lines.extend(["", "<b>Phân bổ Cấp độ cay:</b>"])
        lines.append("• " + " | ".join(f"<b>{html.escape(s['label'])}</b>: {s['count']}" for s in spices))

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


def handle_khuyenmai(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period, data = _overview(arg, cfg=cfg)
    risk = data.get("discountsAndRisk") or {}
    code_stats = risk.get("codeDiscountStats") or []

    active_codes = run_readonly_sql_json(
        """
        SELECT code, name, value_type, value, used_count, usage_limit
        FROM discounts
        WHERE is_archived = FALSE AND is_active = TRUE
        ORDER BY id DESC
        """,
        max_rows=10,
        cfg=cfg,
    )

    lines = [
        f"🎟 <b>[{_proj(cfg)}] KHUYẾN MÃI &amp; GIẢM GIÁ</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Tổng tiền đã giảm: <b>{fmt_vnd(risk.get('totalDiscountAmount', 0))}</b>",
        f"• Giảm thủ công tại quầy: <b>{risk.get('manualDiscountCount', 0)} lượt</b> ({fmt_vnd(risk.get('manualDiscountAmount', 0))})",
    ]
    if code_stats:
        lines.extend(["", "<b>Hiệu quả theo mã trong kỳ:</b>"])
        for c in code_stats:
            lines.append(
                f"• <code>{html.escape(str(c['code']))}</code> ({html.escape(str(c['name']))}): "
                f"<b>{c['usedCountInPeriod']} lượt</b> · -{fmt_vnd(c['totalDiscountedInPeriod'])}"
            )
    if active_codes:
        lines.extend(["", "<b>Mã đang kích hoạt hiện nay:</b>"])
        for c in active_codes:
            val_txt = f"{float(c['value']):g}%" if c.get("value_type") == "PERCENT" else fmt_vnd(c.get("value", 0))
            lim_txt = f"{c['used_count']}/{c['usage_limit']}" if c.get("usage_limit") else f"{c['used_count']}/∞"
            lines.append(f"• <code>{html.escape(str(c['code']))}</code> ({val_txt}) — {html.escape(str(c['name']))} [đã dùng {lim_txt}]")
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_huy(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    period = parse_period_spec(arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])

    voided_orders = run_readonly_sql_json(
        f"""
        SELECT
          o.order_code,
          GREATEST(
            o.total_amount,
            COALESCE((SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0)
          ) AS est_amount,
          COALESCE(o.void_reason, 'Không rõ lý do') AS void_reason,
          COALESCE(e.short_name, u.username, 'Hệ thống') AS actor_name,
          to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm') AS created_hm
        FROM orders o
        LEFT JOIN users u ON u.id = o.cashier_id
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE o.status = 'VOIDED'
          AND o.created_at >= {start_sql} AND o.created_at < {end_sql}
        ORDER BY o.id DESC
        """,
        max_rows=10,
        cfg=cfg,
    )
    cancelled_items = run_readonly_sql_json(
        f"""
        SELECT p.name, SUM(oi.quantity) AS qty, SUM(oi.unit_price * oi.quantity) AS amount
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.kitchen_status = 'CANCELLED'
          AND oi.created_at >= {start_sql} AND oi.created_at < {end_sql}
        GROUP BY p.id, p.name
        ORDER BY qty DESC
        """,
        max_rows=6,
        cfg=cfg,
    )
    pending_edits = run_readonly_sql_json(
        """
        SELECT order_code, total_amount, payment_method,
               pending_payment_edit->>'paymentMethod' AS req_method,
               pending_payment_edit->>'requestedByName' AS req_by
        FROM orders
        WHERE status = 'PAID' AND pending_payment_edit IS NOT NULL
        ORDER BY paid_at DESC NULLS LAST, id DESC
        """,
        max_rows=5,
        cfg=cfg,
    )

    total_void_amt = sum(float(v.get("est_amount", 0) or 0) for v in voided_orders)
    lines = [
        f"🛡 <b>[{_proj(cfg)}] KIỂM SOÁT HỦY ĐƠN &amp; RỦI RO</b>",
        f"🗓 Kỳ: <b>{html.escape(period['label'])}</b>",
        "────────────────",
        f"• Đơn hủy (VOIDED): <b>{len(voided_orders)} đơn</b> (Ước tính {fmt_vnd(total_void_amt)})",
        f"• Sửa phương thức TT chờ duyệt: <b>{len(pending_edits)} đơn</b>",
    ]
    if voided_orders:
        lines.extend(["", "<b>Đơn hủy gần nhất:</b>"])
        for v in voided_orders[:8]:
            lines.append(
                f"• <code>{html.escape(str(v['order_code']))}</code> ({fmt_vnd(v['est_amount'])}) · "
                f"{html.escape(str(v['actor_name']))} ({html.escape(str(v['created_hm']))}): "
                f"<i>{html.escape(str(v['void_reason'])[:60])}</i>"
            )
    if cancelled_items:
        lines.extend(["", "<b>Món bị hủy sau khi in bếp:</b>"])
        for c in cancelled_items:
            lines.append(f"• {html.escape(str(c['name']))}: <b>{c['qty']} phần</b> ({fmt_vnd(c['amount'])})")
    if pending_edits:
        lines.extend(["", "<b>Yêu cầu sửa PTTT chờ duyệt:</b>"])
        for p in pending_edits:
            lines.append(
                f"• <code>{html.escape(str(p['order_code']))}</code> ({fmt_vnd(p['total_amount'])}): "
                f"{p.get('payment_method')} → <b>{p.get('req_method')}</b> ({html.escape(str(p.get('req_by') or '—'))})"
            )
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def handle_audit(arg: str = "", cfg: dict[str, str] | None = None) -> str:
    mod_clean = re.sub(r"[^A-Za-z0-9_]", "", (arg or "").strip()).upper()
    mod_map = {"QR": "PAYMENT_QR", "VIETQR": "PAYMENT_QR", "HR": "SCHEDULES", "LUONG": "PAYROLL", "KHO": "INVENTORY", "KET": "CASHFLOW", "DON": "INVOICES"}
    mod_clean = mod_map.get(mod_clean, mod_clean)

    where_sql = f"WHERE module = {_sql_quote(mod_clean)}" if mod_clean else ""
    rows = run_readonly_sql_json(
        f"""
        SELECT module, action, summary, ip_address, device_label,
               to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm') AS at_vn
        FROM audit_logs
        {where_sql}
        ORDER BY created_at DESC, id DESC
        """,
        max_rows=10,
        cfg=cfg,
    )
    lines = [
        f"📜 <b>[{_proj(cfg)}] NHẬT KÝ KIỂM TOÁN ({html.escape(mod_clean or 'TẤT CẢ')})</b>",
        "────────────────",
    ]
    if not rows:
        lines.append("• Chưa ghi nhận nhật ký nào.")
    else:
        for r in rows:
            meta_parts = [p for p in (r.get("device_label"), r.get("ip_address")) if p]
            meta_suffix = f" <i>({html.escape(' · '.join(str(p) for p in meta_parts))})</i>" if meta_parts else ""
            lines.append(
                f"• [{html.escape(str(r['module']))} · {html.escape(str(r['at_vn']))}] "
                f"{html.escape(str(r['summary']))}{meta_suffix}"
            )
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


def handle_help(cfg: dict[str, str] | None = None) -> str:
    return "\n".join([
        f"🤖 <b>[{_proj(cfg)}] TRỢ LÝ THỐNG KÊ @POS_Lona_bot</b>",
        "────────────────",
        "<b>1. Tổng quan &amp; Bàn đang phục vụ</b>",
        "• /tongquan <code>[ky]</code> — Bảng tổng hợp doanh thu, két, kho, bàn",
        "• /ban — Bàn đang ngồi, tạm tính, đơn Mang về &amp; QR chờ duyệt",
        "• /don <code>[ky | ma_don]</code> — Thống kê đơn hoặc tra chi tiết 1 đơn",
        "",
        "<b>2. Dòng tiền &amp; Tài khoản QR</b>",
        "• /doanhthu <code>[ky]</code> — Doanh thu, tăng trưởng, PTTT &amp; khung giờ",
        "• /ket <code>[ky]</code> — Đối soát két tiền mặt (Invariant 6) &amp; chốt ca",
        "• /qr — Hạn mức ngày/tháng/năm từng tài khoản VietQR",
        "",
        "<b>3. Thực đơn, Bếp &amp; Kho</b>",
        "• /topmon <code>[ky | cham]</code> — Top món bán chạy (hoặc <code>cham</code>)",
        "• /bep <code>[ky]</code> — Sản lượng theo trạm bếp &amp; cấp độ cay",
        "• /kho <code>[ky]</code> — Tổng chi nhập kho (Két/Ngoài) &amp; top nguyên liệu",
        "",
        "<b>4. Khuyến mãi, Rủi ro &amp; Nhân sự</b>",
        "• /khuyenmai <code>[ky]</code> — Hiệu quả mã giảm giá &amp; giảm thủ công",
        "• /huy <code>[ky]</code> — Đơn hủy (VOIDED), món hủy &amp; sửa PTTT",
        "• /audit <code>[module]</code> — 10 nhật ký kiểm toán gần nhất",
        "• /lich <code>[tuan]</code> — Lịch trực hôm nay hoặc cả tuần",
        "• /luong <code>[ky]</code> — Quỹ lương ước tính theo nhân viên",
        "• /loinhuan <code>[ky]</code> — Doanh thu − Kho − Lương",
        "",
        "<b>5. Cách gọi Bot &amp; Hỏi tự do Hệ thống/DB</b>",
        "• 4 cách gọi Bot: <code>Lona</code> / <code>Bot</code> / <code>Trợ lý</code>, tag <code>@POS_Lona_bot</code>, <b>Reply</b> tin nhắn của Bot, hoặc lệnh <code>/...</code>",
        "• Emoji trạng thái: 👀 tiếp nhận · ⚡ cục bộ 0-token · 🤔 Gemini AI · 👍 hoàn tất · 🫡 ngoài phạm vi",
        "• VD 0-token: <i>\"Lona ơi món nào bán chạy nhất tuần này?\"</i>, <i>\"Bot doanh thu tiền mặt hôm nay?\"</i>",
        "• Lệnh phụ: <code>/token</code> (tỷ lệ 0-token), <code>/hoi &lt;câu hỏi&gt;</code>, <code>/quen</code> (xóa ngữ cảnh)",
        "• Tham số <code>[ky]</code>: <code>homnay</code>, <code>homqua</code>, <code>tuan</code>, <code>thang</code>, <code>dd/mm</code>, <code>dd/mm-dd/mm</code>",
        "• <i>Phạm vi bảo mật: Chỉ hỏi đáp trong hệ thống POS &amp; Database Ăn Vặt Tran.</i>",
    ])


def build_daily_close_report(target_date: str | None = None, cfg: dict[str, str] | None = None) -> str:
    date_iso = target_date or vn_today_date().isoformat()
    _, data = _overview(date_iso, cfg=cfg)
    kpis = data.get("kpis") or {}
    rev = kpis.get("revenue") or {}
    cash = kpis.get("cashDrawer") or {}
    trans = kpis.get("transfer") or {}
    inv = kpis.get("inventory") or {}
    risk = data.get("discountsAndRisk") or {}
    open_orders = kpis.get("openOrders") or {}
    top_items = ((data.get("topProducts") or {}).get("items") or [])[:5]

    settlements_resp = call_internal_biz(
        "/internal/biz/cashflow/settlements",
        {"page": 1, "limit": 3, "fromDate": date_iso, "toDate": date_iso},
        cfg=cfg,
    )
    settlements = settlements_resp.get("items") or []
    if settlements:
        s0 = settlements[0]
        settle_line = f"{SETTLEMENT_STATUS_VI.get(s0['status'], s0['status'])} (Thực đếm {fmt_vnd(s0['actualCountedCash'])} · Lệch {fmt_signed_vnd(s0['discrepancyAmount'])})"
    else:
        settle_line = "⏳ Chưa chốt ca ngày hôm nay"

    net_rev = float(rev.get("netPaidAmount", 0) or 0)
    inv_cost = float(inv.get("totalImportCost", 0) or 0)

    lines = [
        f"🌙 <b>[{_proj(cfg)}] CHỐT SỔ CUỐI NGÀY ({fmt_date_vi(date_iso)})</b>",
        "────────────────",
        "<b>1. Doanh thu &amp; Đơn hàng</b>",
        f"• Thực thu: <b>{fmt_vnd(net_rev)}</b> ({_fmt_growth(rev.get('growthPercent'))} vs hôm qua)",
        f"• Tổng đơn: <b>{rev.get('paidOrderCount', 0)} đơn</b> (Tại bàn {rev.get('dineInCount', 0)} · Mang về {rev.get('takeawayCount', 0)} · QR {rev.get('qrSourceCount', 0)})",
        f"• Giá trị TB/đơn: {fmt_vnd(rev.get('averageOrderValue', 0))} · Giảm giá: {fmt_vnd(rev.get('discountAmount', 0))}",
        "",
        "<b>2. Tiền mặt, Chuyển khoản &amp; Két</b>",
        f"• Tiền mặt: <b>{fmt_vnd(cash.get('totalCashSales', 0))}</b> · Chuyển khoản: <b>{fmt_vnd(trans.get('totalTransferSales', 0))}</b>",
        f"• Két lý thuyết: <b>{fmt_vnd(cash.get('expectedCashInDrawer', 0))}</b>",
        f"• Chốt ca: <b>{settle_line}</b>",
        "",
        "<b>3. Nhập kho &amp; Thu − Chi ngày</b>",
        f"• Chi nhập kho: <b>{fmt_vnd(inv_cost)}</b> (Từ két {fmt_vnd(inv.get('cashDrawerImportCost', 0))} · Ngoài {fmt_vnd(inv.get('externalImportCost', 0))})",
        f"• Thu − Nhập kho: <b>{fmt_vnd(net_rev - inv_cost)}</b>",
        "",
        "<b>4. Top 5 món bán chạy</b>",
    ]
    if top_items:
        for i, it in enumerate(top_items, 1):
            lines.append(f"• {i}. {html.escape(str(it['name']))}: <b>{it['qty']} phần</b> ({fmt_vnd(it['revenue'])})")
    else:
        lines.append("• Chưa có đơn thanh toán trong ngày.")

    lines.extend([
        "",
        "<b>5. Kiểm soát rủi ro</b>",
        f"• Đơn hủy: <b>{risk.get('voidedOrderCount', 0)}</b> · Món hủy sau bếp: <b>{risk.get('cancelledPrintedItemCount', 0)}</b>",
    ])
    open_cnt = (open_orders.get("occupiedTableCount", 0) + open_orders.get("pendingTableCount", 0) + open_orders.get("takeawayOpenCount", 0)) if open_orders else 0
    if open_cnt > 0:
        lines.append(f"• ⚠️ Đơn còn mở chưa thanh toán: <b>{open_cnt}</b> ({fmt_vnd(open_orders.get('totalOpenAmount', 0))})")
    lines.append(f"🕒 Lúc: {vn_now_str()}")
    return "\n".join(lines)


def build_weekly_summary_report(today: dt.date | None = None, cfg: dict[str, str] | None = None) -> str:
    today = today or vn_today_date()
    monday = today - dt.timedelta(days=today.weekday())
    sunday = monday + dt.timedelta(days=6)
    end_d = min(today, sunday)
    period_str = f"{monday.isoformat()}..{end_d.isoformat()}"

    _, data = _overview(period_str, cfg=cfg)
    kpis = data.get("kpis") or {}
    rev = kpis.get("revenue") or {}
    inv = kpis.get("inventory") or {}
    risk = data.get("discountsAndRisk") or {}
    series = data.get("revenueSeries") or {}
    top_items = ((data.get("topProducts") or {}).get("items") or [])[:10]

    buckets = series.get("buckets") or []
    non_zero = [b for b in buckets if float(b.get("totalSales", 0) or 0) > 0]
    best_day = max(non_zero, key=lambda b: float(b.get("totalSales", 0) or 0)) if non_zero else None
    low_day = min(non_zero, key=lambda b: float(b.get("totalSales", 0) or 0)) if non_zero else None

    lines = [
        f"📅 <b>[{_proj(cfg)}] TỔNG KẾT TUẦN ({fmt_short_date_vi(monday.isoformat())}–{fmt_date_vi(end_d.isoformat())})</b>",
        "────────────────",
        "<b>1. Doanh thu &amp; Tăng trưởng</b>",
        f"• Thực thu tuần: <b>{fmt_vnd(rev.get('netPaidAmount', 0))}</b> ({_fmt_growth(rev.get('growthPercent'))} vs tuần trước)",
        f"• Tổng đơn: <b>{rev.get('paidOrderCount', 0)} đơn</b> · TB/đơn: <b>{fmt_vnd(rev.get('averageOrderValue', 0))}</b>",
        "",
        "<b>2. Nhịp độ theo ngày</b>",
    ]
    if best_day:
        lines.append(f"• Cao điểm: <b>{html.escape(best_day['label'])}</b> ({fmt_vnd(best_day['totalSales'])} · {best_day['orderCount']} đơn)")
    if low_day and low_day is not best_day:
        lines.append(f"• Thấp điểm: <b>{html.escape(low_day['label'])}</b> ({fmt_vnd(low_day['totalSales'])} · {low_day['orderCount']} đơn)")
    for b in buckets:
        lines.append(f"• {html.escape(b['label'])}: {fmt_vnd(b['totalSales'])} ({b['orderCount']} đơn)")

    lines.extend(["", "<b>3. Top 10 món bán chạy trong tuần</b>"])
    if top_items:
        for i, it in enumerate(top_items, 1):
            lines.append(f"• {i}. {html.escape(str(it['name']))}: <b>{it['qty']} phần</b> ({fmt_vnd(it['revenue'])})")
    else:
        lines.append("• Chưa có món nào bán ra trong tuần.")

    cost_pct = f"{inv['costToRevenuePercent']}%" if inv.get("costToRevenuePercent") is not None else "—"
    lines.extend([
        "",
        "<b>4. Chi phí &amp; Rủi ro tuần</b>",
        f"• Nhập kho: <b>{fmt_vnd(inv.get('totalImportCost', 0))}</b> ({cost_pct} doanh thu · Két {fmt_vnd(inv.get('cashDrawerImportCost', 0))})",
        f"• Giảm giá: {fmt_vnd(risk.get('totalDiscountAmount', 0))} · Đơn hủy: <b>{risk.get('voidedOrderCount', 0)}</b>",
        f"🕒 Lúc: {vn_now_str()}",
    ])
    return "\n".join(lines)
