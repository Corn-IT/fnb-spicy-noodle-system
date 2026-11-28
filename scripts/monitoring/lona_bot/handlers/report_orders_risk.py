"""Order details, void monitoring, promotions, and audit trail reports."""
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

from .report_helpers import _overview, _proj

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
