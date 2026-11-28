"""Deterministic local superlatives and period comparisons (0-token)."""
from __future__ import annotations

import datetime as dt
import html
import re
from typing import Any

from ..core.config import get_biz_config
from ..core.internal_api import call_internal_biz, get_staff_telegram_map, run_readonly_sql_json
from ..core.persona import extract_target_honorific, persona_spec
from ..core.sql_guard import sql_quote as _sql_quote, vn_bounds_sql as _vn_bounds_sql
from ..core.vi_text import (
    extract_third_party_mentions,
    fmt_signed_vnd,
    fmt_vnd,
    parse_period_spec,
    strip_vi,
    vn_now_str,
    vn_today_date,
)
from .report_helpers import STATION_NAMES_VI
from .report_sales_ops import handle_ban, handle_bep, handle_doanhthu, handle_tongquan, handle_topmon
from .report_orders_risk import handle_audit, handle_don, handle_huy, handle_khuyenmai
from .report_finance_hr import handle_ket, handle_kho, handle_lich, handle_loinhuan, handle_luong, handle_qr
from .report_digest import handle_help
from ..nlu.invocation import extract_period_phrase, is_system_doc_question
from ..nlu.system_kb import search_system_docs
from ..state.entity_cache import EntityCache
from ..state.memory import extract_slots_from_text
from ..state.telemetry import TelemetryStore

def _staff_tag(name: str, cfg: dict[str, str] | None = None, alias: str | None = None) -> str:
    clean = (name or "").strip()
    if not clean:
        return "—"
    escaped = html.escape(clean)
    smap = get_staff_telegram_map(cfg)
    if not smap:
        return escaped
    handle = smap.get(strip_vi(clean)) or (smap.get(strip_vi(alias)) if alias else None)
    if handle:
        return f"{escaped} ({html.escape(handle)})"
    return escaped


def _short_money(val: Any) -> str:
    try:
        num = round(float(val or 0))
    except (TypeError, ValueError):
        return "0đ"
    if num >= 1_000_000:
        return f"{num / 1_000_000:.2f}tr".rstrip("0").rstrip(".").replace(".", ",")
    if num >= 1_000:
        return f"{round(num / 1000)}k"
    return f"{num}đ"


def _answer_top_product_superlative(
    period_arg: str,
    slow: bool = False,
    cfg: dict[str, str] | None = None,
    sort_mode: str = "quantity",
) -> dict[str, Any]:
    period = parse_period_spec(period_arg)
    if slow:
        start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
        rows = run_readonly_sql_json(
            f"""
            SELECT p.id, p.name, p.station, p.price,
                   COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID' AND oi.kitchen_status <> 'CANCELLED' AND o.paid_at >= {start_sql} AND o.paid_at < {end_sql}), 0) AS qty_sold
            FROM products p
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON o.id = oi.order_id
            WHERE p.is_available = TRUE
            GROUP BY p.id, p.name, p.station, p.price
            ORDER BY qty_sold ASC, p.name ASC
            """,
            max_rows=5,
            cfg=cfg,
        )
        if not rows:
            return {"text": f"🔎 Chưa có dữ liệu món bán chậm trong kỳ <b>{html.escape(period['label'])}</b>.", "slots": {"intent": "topmon_slow", "period_raw": period_arg}}
        top1 = rows[0]
        runners = " · ".join(f"{i}. {html.escape(str(r['name']))} ({r['qty_sold']})" for i, r in enumerate(rows[1:4], 2))
        text_lines = [
            f"🐢 <b>MÓN BÁN CHẬM NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>",
            f"• Chậm nhất là <b>{html.escape(str(top1['name']))}</b> ({STATION_NAMES_VI.get(top1.get('station', ''), top1.get('station', ''))}): <b>{top1['qty_sold']} phần</b> ({fmt_vnd(top1.get('price', 0))}).",
        ]
        if runners:
            text_lines.append(f"• <i>Tiếp theo: {runners}</i>")
        text_lines.append(f"💡 Xem danh sách chi tiết: gõ <code>/topmon cham {period_arg or ''}</code>".strip())
        return {
            "text": "\n".join(text_lines),
            "slots": {"intent": "topmon_slow", "period_raw": period_arg, "period_label": period["label"], "product_id": top1.get("id"), "product_name": top1["name"]},
        }

    daily = call_internal_biz(
        "/internal/biz/daily-items",
        {"preset": period["preset"], "fromDate": period["fromDate"], "toDate": period["toDate"]},
        cfg=cfg,
    )
    items = daily.get("items") or []
    summary = daily.get("summary") or {}
    if not items:
        return {
            "text": f"🔎 Trong kỳ <b>{html.escape(period['label'])}</b> chưa có món nào bán ra.",
            "slots": {"intent": "topmon_best", "period_raw": period_arg, "period_label": period["label"]},
        }

    if sort_mode == "revenue":
        sorted_items = sorted(
            items,
            key=lambda it: (-float(it.get("revenue") or 0), -int(it.get("qty") or 0)),
        )
        heading = "💰 <b>MÓN DOANH THU CAO NHẤT</b>"
        lead_lbl = "Thu nhiều nhất là"
        intent_key = "topmon_revenue"
    else:
        sorted_items = sorted(
            items,
            key=lambda it: (-int(it.get("qty") or 0), -float(it.get("revenue") or 0)),
        )
        heading = "🔥 <b>MÓN BÁN CHẠY / ĐƯỢC GỌI NHIỀU NHẤT</b>"
        lead_lbl = "Được gọi nhiều nhất là"
        intent_key = "topmon_best"

    top1 = sorted_items[0]
    runners = " · ".join(
        f"{i}. {html.escape(str(it['name']))} ({it['qty']} phần · {_short_money(it.get('revenue'))})"
        for i, it in enumerate(sorted_items[1:4], 2)
    )
    cmd_hint = f"/topmon {period_arg}".strip()
    text_lines = [
        f"{heading} · 🗓 <b>{html.escape(period['label'])}</b>",
        f"🏆 {lead_lbl} <b>{html.escape(str(top1['name']))}</b>: <b>{top1['qty']} phần</b> · <b>{fmt_vnd(top1['revenue'])}</b> ({top1.get('sharePercent', 0)}% tổng {summary.get('totalOrders', 0)} đơn).",
    ]
    if runners:
        text_lines.append(f"• <i>Sát nút: {runners}</i>")
    text_lines.append(f"💡 Xem đủ Top 10: gõ <code>{html.escape(cmd_hint)}</code>")
    return {
        "text": "\n".join(text_lines),
        "slots": {
            "intent": intent_key,
            "period_raw": period_arg,
            "period_label": period["label"],
            "product_id": top1.get("productId"),
            "product_name": top1["name"],
        },
    }


def _answer_peak_hour_superlative(
    period_arg: str,
    cfg: dict[str, str] | None = None,
    quiet: bool = False,
) -> dict[str, Any]:
    period = parse_period_spec(period_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
    order_dir = "ASC" if quiet else "DESC"
    rows = run_readonly_sql_json(
        f"""
        SELECT EXTRACT(HOUR FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hr,
               count(*) AS order_cnt,
               COALESCE(SUM(total_amount), 0) AS rev
        FROM orders
        WHERE status = 'PAID' AND paid_at >= {start_sql} AND paid_at < {end_sql}
        GROUP BY hr
        ORDER BY order_cnt {order_dir}, rev {order_dir}
        """,
        max_rows=8,
        cfg=cfg,
    )
    if not rows:
        return {"text": f"⏰ Trong kỳ <b>{html.escape(period['label'])}</b> chưa có đơn thanh toán để xác định khung giờ.", "slots": {"intent": "peak_hour", "period_raw": period_arg}}

    p0 = rows[0]
    hr0 = int(p0["hr"])
    next_slots = " · ".join(f"{int(r['hr']):02d}h–{int(r['hr'])+1:02d}h ({r['order_cnt']} đơn)" for r in rows[1:4])
    title = "🍃 <b>KHUNG GIỜ VẮNG KHÁCH NHẤT</b>" if quiet else "⏰ <b>KHUNG GIỜ CAO ĐIỂM NHẤT</b>"
    lead = "Ít đơn nhất là khung" if quiet else "Đông nhất là khung"
    lines = [
        f"{title} · 🗓 <b>{html.escape(period['label'])}</b>",
        f"• {lead} <b>{hr0:02d}:00–{hr0+1:02d}:00</b>: <b>{p0['order_cnt']} đơn</b> · <b>{fmt_vnd(p0['rev'])}</b>.",
    ]
    if next_slots:
        lines.append(f"• <i>Tiếp theo: {next_slots}</i>")
    return {"text": "\n".join(lines), "slots": {"intent": "quiet_hour" if quiet else "peak_hour", "period_raw": period_arg, "period_label": period["label"]}}


def _answer_order_top_value(period_arg: str, cfg: dict[str, str] | None = None) -> dict[str, Any]:
    period = parse_period_spec(period_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
    rows = run_readonly_sql_json(
        f"""
        SELECT o.order_code, o.total_amount, o.order_type, o.takeaway_number, dt.name AS table_name
        FROM orders o
        LEFT JOIN dining_tables dt ON dt.id = o.table_id
        WHERE o.status = 'PAID' AND o.paid_at >= {start_sql} AND o.paid_at < {end_sql}
        ORDER BY o.total_amount DESC, o.id DESC
        """,
        max_rows=3,
        cfg=cfg,
    )
    if not rows:
        return {"text": f"🧾 Trong kỳ <b>{html.escape(period['label'])}</b> chưa có đơn đã thanh toán.", "slots": {"intent": "order_top_value", "period_raw": period_arg}}
    top = rows[0]
    loc = top.get("table_name") or (f"Mang về #{top['takeaway_number']}" if top.get("takeaway_number") else "Mang về")
    return {
        "text": (
            f"🧾 <b>ĐƠN GIÁ TRỊ CAO NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>\n"
            f"• Cao nhất là đơn <code>{html.escape(str(top['order_code']))}</code> ({html.escape(str(loc))}): "
            f"<b>{fmt_vnd(top['total_amount'])}</b>."
        ),
        "slots": {"intent": "order_top_value", "period_raw": period_arg, "order_code": str(top["order_code"])},
    }


def _answer_staff_superlative(norm_q: str, period_arg: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    period = parse_period_spec(period_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])

    if any(k in norm_q for k in ("huy", "void")):
        rows = run_readonly_sql_json(
            f"""
            SELECT COALESCE(al.actor_full_name, al.actor_username, 'Không rõ') AS actor_name,
                   count(*) AS void_cnt
            FROM audit_logs al
            WHERE al.module = 'INVOICES'
              AND (al.action ILIKE '%hủy%' OR al.action ILIKE '%huỷ%' OR al.action ILIKE '%VOID%')
              AND al.created_at >= {start_sql} AND al.created_at < {end_sql}
            GROUP BY actor_name
            ORDER BY void_cnt DESC
            """,
            max_rows=5,
            cfg=cfg,
        )
        if not rows:
            return {"text": f"🛡 Trong kỳ <b>{html.escape(period['label'])}</b> chưa ghi nhận lượt hủy đơn nào.", "slots": {"intent": "staff_void_top", "period_raw": period_arg}}
        top = rows[0]
        runners = " · ".join(f"{_staff_tag(str(r['actor_name']), cfg)} ({r['void_cnt']})" for r in rows[1:4])
        lines = [
            f"🛡 <b>NGƯỜI HỦY ĐƠN NHIỀU NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>",
            f"• Nhiều nhất: <b>{_staff_tag(str(top['actor_name']), cfg)}</b> — <b>{top['void_cnt']} lượt</b>.",
        ]
        if runners:
            lines.append(f"• <i>Khác: {runners}</i>")
        return {"text": "\n".join(lines), "slots": {"intent": "staff_void_top", "period_raw": period_arg, "employee_name": top["actor_name"]}}

    if any(k in norm_q for k in ("thu ngan", "ai ban", "nhan vien nao ban", "thu ngan nao", "chot don")):
        rows = run_readonly_sql_json(
            f"""
            SELECT COALESCE(e.short_name, e.full_name, u.username, 'Không rõ') AS cashier_name,
                   count(*) AS order_cnt,
                   COALESCE(SUM(o.total_amount), 0) AS rev
            FROM orders o
            LEFT JOIN users u ON u.id = o.cashier_id
            LEFT JOIN employees e ON e.id = u.employee_id
            WHERE o.status = 'PAID' AND o.paid_at >= {start_sql} AND o.paid_at < {end_sql}
            GROUP BY cashier_name
            ORDER BY order_cnt DESC, rev DESC
            """,
            max_rows=5,
            cfg=cfg,
        )
        if not rows:
            return {"text": f"🧾 Trong kỳ <b>{html.escape(period['label'])}</b> chưa có đơn thanh toán.", "slots": {"intent": "staff_sales_top", "period_raw": period_arg}}
        top = rows[0]
        runners = " · ".join(f"{_staff_tag(str(r['cashier_name']), cfg)} ({r['order_cnt']} đơn)" for r in rows[1:4])
        lines = [
            f"🏆 <b>THU NGÂN BÁN NHIỀU NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>",
            f"• Dẫn đầu: <b>{_staff_tag(str(top['cashier_name']), cfg)}</b> — <b>{top['order_cnt']} đơn</b> ({fmt_vnd(top['rev'])}).",
        ]
        if runners:
            lines.append(f"• <i>Tiếp theo: {runners}</i>")
        return {"text": "\n".join(lines), "slots": {"intent": "staff_sales_top", "period_raw": period_arg, "employee_name": top["cashier_name"]}}

    return None


def _handle_period_comparison(norm_q: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    if not any(k in norm_q for k in ("so sanh", "tang hay giam", "chenh lech", "vs ")):
        return None
    if "thang" in norm_q:
        p_cur_arg, p_prev_arg = "thang", "thangtruoc"
    elif "tuan" in norm_q:
        p_cur_arg, p_prev_arg = "tuan", "tuantruoc"
    else:
        p_cur_arg, p_prev_arg = "homnay", "homqua"

    p1 = parse_period_spec(p_cur_arg)
    p2 = parse_period_spec(p_prev_arg)
    d1 = call_internal_biz("/internal/biz/overview", {"preset": p1["preset"], "fromDate": p1["fromDate"], "toDate": p1["toDate"]}, cfg=cfg)
    d2 = call_internal_biz("/internal/biz/overview", {"preset": p2["preset"], "fromDate": p2["fromDate"], "toDate": p2["toDate"]}, cfg=cfg)
    r1 = (d1.get("kpis") or {}).get("revenue") or {}
    r2 = (d2.get("kpis") or {}).get("revenue") or {}
    a1 = float(r1.get("netPaidAmount", 0) or 0)
    a2 = float(r2.get("netPaidAmount", 0) or 0)
    diff = a1 - a2
    pct_txt = f"{((diff / a2) * 100):+.1f}%" if a2 > 0 else ("Tăng mới" if a1 > 0 else "0%")
    c1 = int(r1.get("paidOrderCount", 0) or 0)
    c2 = int(r2.get("paidOrderCount", 0) or 0)
    trend_icon = "📈" if diff > 0 else ("📉" if diff < 0 else "➖")
    return {
        "text": "\n".join([
            f"{trend_icon} <b>SO SÁNH: {html.escape(p1['label'])} vs {html.escape(p2['label'])}</b>",
            f"• <b>{html.escape(p1['label'])}:</b> <b>{fmt_vnd(a1)}</b> ({c1} đơn · TB {fmt_vnd(r1.get('averageOrderValue', 0))})",
            f"• <b>{html.escape(p2['label'])}:</b> <b>{fmt_vnd(a2)}</b> ({c2} đơn · TB {fmt_vnd(r2.get('averageOrderValue', 0))})",
            f"• Chênh lệch: <b>{fmt_signed_vnd(diff)}</b> (<b>{pct_txt}</b> · {c1 - c2:+d} đơn)",
        ]),
        "slots": {"intent": "compare", "period_raw": p_cur_arg},
    }
