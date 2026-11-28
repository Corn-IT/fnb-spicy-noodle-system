"""Targeted slice filters, single product lookups, and recent-order queries."""
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

from .local_superlatives import _short_money, _staff_tag

def _handle_targeted_slice(norm_q: str, period_arg: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    # 1. Specific physical table details (e.g. "Bàn 05 đang gọi gì?")
    m_tbl = re.search(r"\bban\s*(?:so\s*)?0*(\d{1,2})\b", norm_q)
    if m_tbl and not any(k in norm_q for k in ("bao nhieu ban", "may ban", "ban nao")):
        num = int(m_tbl.group(1))
        all_tables = run_readonly_sql_json(
            """
            SELECT dt.name AS table_name, dt.status, o.id AS order_id, o.order_code, o.total_amount,
                   to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS since_hm
            FROM dining_tables dt
            LEFT JOIN orders o ON o.id = dt.active_order_id
            ORDER BY dt.id ASC
            """,
            max_rows=50,
            cfg=cfg,
        )
        t = next(
            (
                row for row in all_tables
                if re.search(rf"(?<![0-9])0*{num}(?![0-9])", strip_vi(str(row.get("table_name") or "")))
            ),
            None,
        )
        if not t:
            return {"text": f"🔎 Không tìm thấy <b>Bàn {num:02d}</b> trong hệ thống.", "slots": {"intent": "table_detail"}}
        if t.get("status") == "AVAILABLE" or not t.get("order_id"):
            return {"text": f"✅ <b>{html.escape(str(t['table_name']))}</b> hiện đang <b>TRỐNG</b>.", "slots": {"intent": "table_detail", "table_name": t["table_name"]}}
        items = run_readonly_sql_json(
            f"""
            SELECT p.name, oi.quantity, oi.kitchen_status
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = {int(t['order_id'])} AND oi.kitchen_status <> 'CANCELLED'
            ORDER BY oi.id ASC
            """,
            max_rows=15,
            cfg=cfg,
        )
        lines = [
            f"🪑 <b>{html.escape(str(t['table_name']))}</b> [{html.escape(str(t['status']))}] · <code>{html.escape(str(t['order_code']))}</code>",
            f"• Tạm tính: <b>{fmt_vnd(t['total_amount'])}</b> (vào lúc {html.escape(str(t.get('since_hm') or ''))})",
        ]
        if items:
            lines.append("• Món đang gọi: " + ", ".join(f"{it['quantity']}x {html.escape(str(it['name']))}" for it in items[:10]))
        return {"text": "\n".join(lines), "slots": {"intent": "table_detail", "table_name": t["table_name"], "order_code": t.get("order_code")}}

    # 2. Active login sessions & IPs
    if any(k in norm_q for k in ("dang dang nhap", "ai dang online", "ip dang nhap", "phien dang nhap", "dia chi ip", "thiet bi nao dang")):
        rows = run_readonly_sql_json(
            """
            SELECT u.username, COALESCE(e.short_name, e.full_name, u.role_label) AS display_name,
                   u.active_session_ip, u.active_session_device,
                   to_char(u.active_session_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm') AS at_vn
            FROM users u
            LEFT JOIN employees e ON e.id = u.employee_id
            WHERE u.is_active = TRUE AND u.active_session_ip IS NOT NULL
            ORDER BY u.active_session_at DESC NULLS LAST
            """,
            max_rows=20,
            cfg=cfg,
        )
        if not rows:
            return {"text": "🔐 Hiện chưa ghi nhận phiên đăng nhập nào có địa chỉ IP hoạt động.", "slots": {"intent": "active_sessions"}}
        lines = ["🔐 <b>PHIÊN ĐĂNG NHẬP POS ĐANG HOẠT ĐỘNG</b>"]
        for r in rows:
            dev = html.escape(str(r.get("active_session_device") or "Không rõ thiết bị"))
            ip = html.escape(str(r.get("active_session_ip") or "—"))
            lines.append(
                f"• <b>{_staff_tag(str(r['display_name']), cfg)}</b> (<code>{html.escape(str(r['username']))}</code>): "
                f"IP <code>{ip}</code> · {dev} ({html.escape(str(r.get('at_vn') or ''))})"
            )
        return {"text": "\n".join(lines), "slots": {"intent": "active_sessions"}}

    # 3. Payment / order-type narrow slices (e.g. cash revenue only, transfer only, takeaway count only)
    has_cash = any(k in norm_q for k in ("tien mat", "thu mat")) and "chuyen khoan" not in norm_q and "ket" not in norm_q
    has_qr_orders = any(k in norm_q for k in ("don qr", "khach tu dat", "khach quet qr", "don khach quet qr"))
    has_transfer = (any(k in norm_q for k in ("chuyen khoan", "thu qr")) or ("quet qr" in norm_q and not has_qr_orders)) and "tien mat" not in norm_q
    has_takeaway = "mang ve" in norm_q and "tai ban" not in norm_q

    if has_cash or has_transfer or has_takeaway or has_qr_orders:
        period = parse_period_spec(period_arg)
        data = call_internal_biz("/internal/biz/overview", {"preset": period["preset"], "fromDate": period["fromDate"], "toDate": period["toDate"]}, cfg=cfg)
        kpis = data.get("kpis") or {}
        rev = kpis.get("revenue") or {}
        cash = kpis.get("cashDrawer") or {}
        trans = kpis.get("transfer") or {}
        lbl = html.escape(period["label"])
        if has_cash:
            return {
                "text": f"💵 <b>Doanh thu Tiền mặt ({lbl}):</b> <b>{fmt_vnd(cash.get('totalCashSales', 0))}</b> (Tiền thuần {fmt_vnd(cash.get('cashOnlySales', 0))} + Split {fmt_vnd(cash.get('splitCashSales', 0))} · Tổng thực thu {fmt_vnd(rev.get('netPaidAmount', 0))}).",
                "slots": {"intent": "slice_cash", "period_raw": period_arg},
            }
        if has_qr_orders:
            return {
                "text": f"📱 <b>Đơn khách quét QR ({lbl}):</b> <b>{rev.get('qrSourceCount', 0)} đơn</b> đã thanh toán (trên tổng {rev.get('paidOrderCount', 0)} đơn · POS quầy {rev.get('posSourceCount', 0)}).",
                "slots": {"intent": "slice_qr_orders", "period_raw": period_arg},
            }
        if has_transfer:
            return {
                "text": f"🏦 <b>Doanh thu Chuyển khoản ({lbl}):</b> <b>{fmt_vnd(trans.get('totalTransferSales', 0))}</b> (Tổng thực thu {fmt_vnd(rev.get('netPaidAmount', 0))}).",
                "slots": {"intent": "slice_transfer", "period_raw": period_arg},
            }
        if has_takeaway:
            return {
                "text": f"🛍 <b>Đơn Mang về đã thanh toán ({lbl}):</b> <b>{rev.get('takeawayCount', 0)} đơn</b> (trên tổng {rev.get('paidOrderCount', 0)} đơn · Tại bàn {rev.get('dineInCount', 0)}).",
                "slots": {"intent": "slice_takeaway", "period_raw": period_arg},
            }

    return None


def _query_single_product(
    product_name: str,
    period_arg: str,
    ask_price_only: bool = False,
    cfg: dict[str, str] | None = None,
) -> dict[str, Any]:
    period = parse_period_spec(period_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
    prods = run_readonly_sql_json(
        f"SELECT id, name, price, station, is_available FROM products WHERE LOWER(name) = LOWER({_sql_quote(product_name)}) LIMIT 1",
        max_rows=1,
        cfg=cfg,
    )
    if not prods:
        return {"text": f"🔎 Không tìm thấy món <b>{html.escape(product_name)}</b> trong thực đơn.", "slots": {"intent": "product_lookup"}}
    p = prods[0]
    st_lbl = STATION_NAMES_VI.get(str(p.get("station") or ""), str(p.get("station") or ""))
    avail_txt = "Còn bán" if p.get("is_available") else "Đang tạm ngưng"
    if ask_price_only:
        return {
            "text": f"🍜 <b>{html.escape(str(p['name']))}</b>: giá niêm yết <b>{fmt_vnd(p['price'])}</b> · {st_lbl} · Trạng thái: <b>{avail_txt}</b>.",
            "slots": {"intent": "product_price", "product_id": p["id"], "product_name": p["name"]},
        }

    stats = run_readonly_sql_json(
        f"""
        SELECT COALESCE(SUM(oi.quantity), 0) AS qty_sold,
               count(DISTINCT o.id) AS order_cnt,
               COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_rev
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = {int(p['id'])}
          AND oi.kitchen_status <> 'CANCELLED'
          AND o.status = 'PAID'
          AND o.paid_at >= {start_sql} AND o.paid_at < {end_sql}
        """,
        max_rows=1,
        cfg=cfg,
    )
    s = stats[0] if stats else {"qty_sold": 0, "order_cnt": 0, "gross_rev": 0}
    return {
        "text": "\n".join([
            f"🍜 <b>{html.escape(str(p['name']))}</b> · 🗓 <b>{html.escape(period['label'])}</b>",
            f"• Đã bán: <b>{s['qty_sold']} phần</b> (trong {s['order_cnt']} đơn · ước tính {fmt_vnd(s['gross_rev'])}).",
            f"• Giá menu: {fmt_vnd(p['price'])} · {st_lbl} ({avail_txt}).",
        ]),
        "slots": {"intent": "product_sales", "period_raw": period_arg, "period_label": period["label"], "product_id": p["id"], "product_name": p["name"]},
    }


def _handle_entity_match(
    norm_q: str,
    period_arg: str,
    cache: EntityCache,
    cfg: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    # 1. Product entity match (only when question mentions menu/sales/price intent)
    ask_price = any(k in norm_q for k in ("gia bao nhieu", "bao nhieu tien", "may tien", "con ban khong", "con khong"))
    ask_sales = any(k in norm_q for k in ("ban duoc", "bao nhieu phan", "may phan", "bao nhieu ly", "may ly", "bao nhieu to", "may to", "doanh thu", "sl ", "so luong"))
    if ask_price or ask_sales:
        products = cache.get_products(cfg=cfg)
        for p in products:
            pn = p.get("_norm") or ""
            if len(pn) >= 5 and re.search(rf"(?<![a-z0-9]){re.escape(pn)}(?![a-z0-9])", norm_q):
                return _query_single_product(str(p["name"]), period_arg, ask_price_only=(ask_price and not ask_sales), cfg=cfg)

    # 2. Employee entity match
    employees = cache.get_employees(cfg=cfg)
    matched_emp = None
    for e in employees:
        for key in (e.get("_norm_full"), e.get("_norm_short")):
            if key and len(key) >= 3 and re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", norm_q):
                matched_emp = e
                break
        if matched_emp:
            break

    if matched_emp:
        emp_name = str(matched_emp.get("short_name") or matched_emp.get("full_name"))
        if any(k in norm_q for k in ("luong", "cong")):
            period = parse_period_spec(period_arg or "thang")
            payroll = call_internal_biz("/internal/biz/payroll", {"fromDate": period["fromDate"], "toDate": period["toDate"]}, cfg=cfg)
            for item in payroll.get("items") or []:
                if item.get("employeeId") == matched_emp.get("id") or strip_vi(str(item.get("shortName", ""))) == matched_emp.get("_norm_short"):
                    return {
                        "text": f"👷 <b>Lương {_staff_tag(emp_name, cfg)} ({html.escape(period['label'])}):</b> <b>{fmt_vnd(item.get('totalSalary', 0))}</b> ({item.get('fullShiftDays', 0)} ngày full · {item.get('customHours', 0)} giờ lẻ).",
                        "slots": {"intent": "emp_payroll", "period_raw": period_arg or "thang", "employee_id": matched_emp["id"], "employee_name": emp_name},
                    }
        if any(k in norm_q for k in ("lich", "truc", "ca lam")):
            today = vn_today_date()
            monday = today - dt.timedelta(days=today.weekday())
            sched = call_internal_biz("/internal/biz/schedule", {"weekStartDate": monday.isoformat()}, cfg=cfg)
            dow_names = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
            shifts = []
            for c in sched.get("cells") or []:
                for ce in c.get("employees") or []:
                    if ce.get("id") == matched_emp.get("id") or strip_vi(str(ce.get("shortName", ""))) == matched_emp.get("_norm_short"):
                        shifts.append(f"{dow_names[int(c['dayOfWeek'])]} ({c['timeSlot']})")
            shift_txt = ", ".join(shifts) if shifts else "Chưa xếp ca tuần này"
            return {
                "text": f"📅 <b>Lịch trực tuần này của {_staff_tag(emp_name, cfg)}:</b> {html.escape(shift_txt)}.",
                "slots": {"intent": "emp_schedule", "employee_id": matched_emp["id"], "employee_name": emp_name},
            }
        if any(k in norm_q for k in ("sdt", "so dien thoai", "dien thoai", "stk", "ngan hang", "tai khoan", "ho so", "thong tin", "nhan vien")):
            bank = " ".join(x for x in (matched_emp.get("bank_name"), matched_emp.get("bank_account_no")) if x) or "Chưa cập nhật"
            role = " · ".join(x for x in (matched_emp.get("position_name"), matched_emp.get("specialty_name")) if x) or "Nhân viên"
            return {
                "text": "\n".join([
                    f"👤 <b>HỒ SƠ NHÂN VIÊN: {_staff_tag(str(matched_emp['full_name']), cfg, alias=emp_name)}</b> ({html.escape(emp_name)})",
                    f"• Vị trí: {html.escape(role)} · Vào làm: {html.escape(str(matched_emp.get('start_vn') or '—'))}",
                    f"• SĐT: <code>{html.escape(str(matched_emp.get('phone') or '—'))}</code>",
                    f"• Ngân hàng: <code>{html.escape(bank)}</code>",
                ]),
                "slots": {"intent": "emp_profile", "employee_id": matched_emp["id"], "employee_name": emp_name},
            }

    return None
