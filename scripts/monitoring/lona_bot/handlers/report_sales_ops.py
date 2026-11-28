"""Sales, live table occupancy, kitchen stations, and best-selling menu reports."""
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

from .report_helpers import STATION_NAMES_VI, _fmt_growth, _overview, _proj

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
