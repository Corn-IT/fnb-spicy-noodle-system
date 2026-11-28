#!/usr/bin/env python3
"""
Local-First 0-Token Focused Query & Context Resolution Engine for @POS_Lona_bot.
Answers focused operational questions directly from internal NestJS endpoints and
scoped read-only PostgreSQL (fnb_bot_ro) with 0 Gemini tokens and <0.3s latency.
"""

from __future__ import annotations

import datetime as dt
import html
import re
import time
from typing import Any

from biz_bot_common import (
    call_internal_biz,
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
from biz_bot_nlp import extract_period_phrase, is_system_doc_question
from biz_bot_queries import (
    STATION_NAMES_VI,
    handle_ban,
    handle_bep,
    handle_doanhthu,
    handle_don,
    handle_huy,
    handle_ket,
    handle_kho,
    handle_khuyenmai,
    handle_lich,
    handle_loinhuan,
    handle_luong,
    handle_qr,
    handle_tongquan,
    handle_topmon,
)

ENTITY_CACHE_TTL_SEC = 300


def _sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _vn_bounds_sql(from_date: str, to_date: str) -> tuple[str, str]:
    start_ts = f"{from_date} 00:00:00+07"
    end_d = dt.date.fromisoformat(to_date) + dt.timedelta(days=1)
    end_ts = f"{end_d.isoformat()} 00:00:00+07"
    return _sql_quote(start_ts), _sql_quote(end_ts)


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


def _resolve_meta_faq(norm_q: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    proj = html.escape((cfg or get_biz_config())["project_name"])
    if any(k in norm_q for k in ("khong ton token", "ton token", "tiet kiem token")):
        return {
            "text": "\n".join([
                f"💡 <b>[{proj}] CÁC CÂU HỎI 0 TOKEN vs GEMINI AI</b>",
                "────────────────",
                "• <b>Xử lý cục bộ ⚡ 0 token (&lt;0,3s):</b>",
                "  1) Toàn bộ 17 lệnh <code>/...</code> (<code>/tongquan</code>, <code>/ban</code>, <code>/don</code>, <code>/doanhthu</code>, <code>/ket</code>, <code>/topmon</code>, <code>/token</code>...)",
                "  2) Hỏi trực diện cực trị: món chạy nhất/chậm nhất, giờ cao điểm, thu ngân hủy/bán nhiều nhất",
                "  3) Lát cắt số liệu: tiền mặt, chuyển khoản, mang về, QR, chi tiết Bàn 01..30, so sánh 2 kỳ",
                "  4) Tra tên món/giá/doanh số món, SĐT/STK/lịch/lương nhân viên, IP đang đăng nhập POS &amp; hỏi nối tiếp",
                "• <b>Gọi Gemini AI 🤖 (có tốn token):</b> Phân tích mở nhiều điều kiện hoặc tra cứu tài liệu phần mềm (cách dùng 16 phân hệ, máy in RawBT/LAN, RBAC, 10 Invariants).",
                "• Dùng <code>/token</code> để xem thống kê tiết kiệm token thực tế.",
            ]),
            "slots": {"intent": "meta_token"},
        }

    if any(k in norm_q for k in ("biet lam gi", "lam duoc gi", "giup duoc gi", "chuc nang gi")):
        return {
            "text": "\n".join([
                f"🤖 <b>[{proj}] TRỢ LÝ @POS_Lona_bot</b>",
                "────────────────",
                "• <b>Tra số liệu &amp; DB 20 bảng:</b> Doanh thu, két tiền, đơn hàng/Bàn, món bán chạy/chậm, bếp, nhập kho, QR, khuyến mãi, nhân sự, lịch trực, lương, phiên IP &amp; audit.",
                "• <b>Giải đáp phần mềm POS:</b> Hướng dẫn 16 phân hệ, máy in 80mm/RawBT/iMin, Single-Session, 10 Hard Invariants.",
                "• Gõ <code>/help</code> để xem đầy đủ 17 lệnh nhanh &amp; cách gọi Bot (<code>Lona</code> / <code>Bot</code> / <code>@POS_Lona_bot</code> / Reply).",
            ]),
            "slots": {"intent": "meta_help"},
        }

    if any(k in norm_q for k in ("truy cap vao db", "truy cap db", "ket noi db", "truy cap database")):
        return {
            "text": "\n".join([
                f"✅ <b>[{proj}] KẾT NỐI DATABASE PRODUCTION</b>",
                "────────────────",
                "• Bot kết nối trực tiếp PostgreSQL production (<code>fnb_pos</code>) qua role chỉ đọc <code>fnb_bot_ro</code> + API nội bộ loopback.",
                "• Phạm vi Chủ quán &amp; Quản lý cấp cao: mở đọc toàn bộ <b>20 bảng/view nghiệp vụ &amp; HR</b>, chỉ khóa 3 bí mật mật mã kỹ thuật (hash mật khẩu, khóa riêng VAPID, khóa mã hóa push).",
            ]),
            "slots": {"intent": "meta_db"},
        }
    return None


def _answer_top_product_superlative(
    period_arg: str,
    slow: bool = False,
    cfg: dict[str, str] | None = None,
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

    top1 = items[0]
    runners = " · ".join(
        f"{i}. {html.escape(str(it['name']))} ({it['qty']} phần)"
        for i, it in enumerate(items[1:4], 2)
    )
    cmd_hint = f"/topmon {period_arg}".strip()
    text_lines = [
        f"🔥 <b>MÓN BÁN CHẠY NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>",
        f"🏆 Bán chạy nhất là <b>{html.escape(str(top1['name']))}</b>: <b>{top1['qty']} phần</b> · <b>{fmt_vnd(top1['revenue'])}</b> ({top1.get('sharePercent', 0)}% tổng {summary.get('totalOrders', 0)} đơn).",
    ]
    if runners:
        text_lines.append(f"• <i>Sát nút: {runners}</i>")
    text_lines.append(f"💡 Xem đủ Top 10: gõ <code>{html.escape(cmd_hint)}</code>")
    return {
        "text": "\n".join(text_lines),
        "slots": {
            "intent": "topmon_best",
            "period_raw": period_arg,
            "period_label": period["label"],
            "product_id": top1.get("productId"),
            "product_name": top1["name"],
        },
    }


def _answer_peak_hour_superlative(period_arg: str, cfg: dict[str, str] | None = None) -> dict[str, Any]:
    period = parse_period_spec(period_arg)
    start_sql, end_sql = _vn_bounds_sql(period["fromDate"], period["toDate"])
    rows = run_readonly_sql_json(
        f"""
        SELECT EXTRACT(HOUR FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hr,
               count(*) AS order_cnt,
               COALESCE(SUM(total_amount), 0) AS rev
        FROM orders
        WHERE status = 'PAID' AND paid_at >= {start_sql} AND paid_at < {end_sql}
        GROUP BY hr
        ORDER BY order_cnt DESC, rev DESC
        """,
        max_rows=8,
        cfg=cfg,
    )
    if not rows:
        return {"text": f"⏰ Trong kỳ <b>{html.escape(period['label'])}</b> chưa có đơn thanh toán để xác định khung giờ.", "slots": {"intent": "peak_hour", "period_raw": period_arg}}

    p0 = rows[0]
    hr0 = int(p0["hr"])
    next_slots = " · ".join(f"{int(r['hr']):02d}h–{int(r['hr'])+1:02d}h ({r['order_cnt']} đơn)" for r in rows[1:4])
    lines = [
        f"⏰ <b>KHUNG GIỜ CAO ĐIỂM NHẤT</b> · 🗓 <b>{html.escape(period['label'])}</b>",
        f"• Đông nhất là khung <b>{hr0:02d}:00–{hr0+1:02d}:00</b>: <b>{p0['order_cnt']} đơn</b> · <b>{fmt_vnd(p0['rev'])}</b>.",
    ]
    if next_slots:
        lines.append(f"• <i>Tiếp theo: {next_slots}</i>")
    return {"text": "\n".join(lines), "slots": {"intent": "peak_hour", "period_raw": period_arg, "period_label": period["label"]}}


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


def _handle_targeted_slice(norm_q: str, period_arg: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    # 1. Specific physical table details (e.g. "Bàn 05 đang gọi gì?")
    m_tbl = re.search(r"\bban\s*(?:so\s*)?0*(\d{1,2})\b", norm_q)
    if m_tbl and not any(k in norm_q for k in ("bao nhieu ban", "may ban", "ban nao")):
        num = int(m_tbl.group(1))
        pattern_sql = _sql_quote(rf"(?:ban|bàn)\s*0*{num}\b")
        rows = run_readonly_sql_json(
            f"""
            SELECT dt.name AS table_name, dt.status, o.id AS order_id, o.order_code, o.total_amount,
                   to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS since_hm
            FROM dining_tables dt
            LEFT JOIN orders o ON o.id = dt.active_order_id
            WHERE dt.name ~* {pattern_sql}
            ORDER BY dt.id ASC
            """,
            max_rows=1,
            cfg=cfg,
        )
        if not rows:
            return {"text": f"🔎 Không tìm thấy <b>Bàn {num:02d}</b> trong hệ thống.", "slots": {"intent": "table_detail"}}
        t = rows[0]
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
    has_transfer = any(k in norm_q for k in ("chuyen khoan", "quet qr", "thu qr")) and "tien mat" not in norm_q
    has_takeaway = "mang ve" in norm_q and "tai ban" not in norm_q
    has_qr_orders = any(k in norm_q for k in ("don qr", "khach tu dat", "khach quet qr"))

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
        if has_qr_orders:
            return {
                "text": f"📱 <b>Đơn khách quét QR ({lbl}):</b> <b>{rev.get('qrSourceCount', 0)} đơn</b> đã thanh toán (trên tổng {rev.get('paidOrderCount', 0)} đơn · POS quầy {rev.get('posSourceCount', 0)}).",
                "slots": {"intent": "slice_qr_orders", "period_raw": period_arg},
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


def _handle_followup_local(
    norm_q: str,
    slots: dict[str, Any],
    cfg: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    if not slots:
        return None

    # 1. Expand "xem đủ top 10"
    if any(k in norm_q for k in ("xem du", "top 10", "ca danh sach", "danh sach day du")) and slots.get("intent") in ("topmon_best", "topmon_slow"):
        p_arg = str(slots.get("period_raw") or "")
        arg = f"cham {p_arg}".strip() if slots.get("intent") == "topmon_slow" else p_arg
        return {"text": handle_topmon(arg, cfg=cfg), "slots": slots}

    # 2. Pronoun follow-up about previously mentioned product
    if slots.get("product_name"):
        pname = str(slots["product_name"])
        new_period = extract_period_phrase(norm_q)
        if any(k in norm_q for k in ("mon do", "mon nay", "no")) and any(k in norm_q for k in ("gia", "bao nhieu tien", "may tien")):
            return _query_single_product(pname, str(slots.get("period_raw") or ""), ask_price_only=True, cfg=cfg)
        if any(k in norm_q for k in ("mon do", "mon nay")) or (new_period and slots.get("intent") in ("topmon_best", "product_sales")):
            return _query_single_product(pname, new_period or str(slots.get("period_raw") or ""), cfg=cfg)

    # 3. Period-shift follow-up ("còn hôm qua?", "còn tuần trước?")
    new_period = extract_period_phrase(norm_q)
    if new_period and any(k in norm_q for k in ("con ", "the ", "sao", "thi sao")) and len(norm_q.split()) <= 7:
        last_intent = str(slots.get("intent") or "")
        if last_intent == "topmon_best":
            return _answer_top_product_superlative(new_period, slow=False, cfg=cfg)
        if last_intent == "topmon_slow":
            return _answer_top_product_superlative(new_period, slow=True, cfg=cfg)
        if last_intent == "peak_hour":
            return _answer_peak_hour_superlative(new_period, cfg=cfg)
        cmd_map = {
            "don": lambda p: handle_don(p, cfg=cfg),
            "doanhthu": lambda p: handle_doanhthu(p, cfg=cfg),
            "ket": lambda p: handle_ket(p, cfg=cfg),
            "kho": lambda p: handle_kho(p, cfg=cfg),
            "khuyenmai": lambda p: handle_khuyenmai(p, cfg=cfg),
            "huy": lambda p: handle_huy(p, cfg=cfg),
            "loinhuan": lambda p: handle_loinhuan(p, cfg=cfg),
            "luong": lambda p: handle_luong(p, cfg=cfg),
            "bep": lambda p: handle_bep(p, cfg=cfg),
            "tongquan": lambda p: handle_tongquan(p, cfg=cfg),
        }
        if last_intent in cmd_map:
            return {"text": cmd_map[last_intent](new_period), "slots": {**slots, "period_raw": new_period}}

    return None


def try_answer_locally(
    clean_q: str,
    cfg: dict[str, str] | None = None,
    slots: dict[str, Any] | None = None,
    cache: EntityCache | None = None,
) -> dict[str, Any] | None:
    """
    Attempt 0-token focused resolution before calling Gemini AI.
    Returns {'text': str, 'slots': dict, 'route': 'local'|'fast_path'} or None to fall through to Gemini.
    """
    norm_q = strip_vi(clean_q)
    if not norm_q:
        return None
    cache = cache or EntityCache()

    # 1. Meta FAQs about the bot itself (0 tokens)
    meta = _resolve_meta_faq(norm_q, cfg=cfg)
    if meta:
        return {**meta, "route": "local"}

    # 2. Never intercept software usage / RBAC / hardware / invariant docs -> route to Gemini RAG
    if is_system_doc_question(clean_q):
        return None

    # 3. Direct invoice lookup (HD-... / ORD-...)
    m_code = re.search(r"\b((?:HD|ORD)-[A-Z0-9-]+)\b", clean_q, re.I)
    if m_code:
        code = m_code.group(1).upper()
        return {"text": handle_don(code, cfg=cfg), "slots": {"intent": "order_detail", "order_code": code}, "route": "fast_path"}

    period_arg = extract_period_phrase(norm_q)

    # 4. Structured context follow-ups ("Hôm nay món đó...", "Còn hôm qua?", "Xem đủ top 10")
    if slots:
        fu = _handle_followup_local(norm_q, slots, cfg=cfg)
        if fu:
            return {**fu, "route": "local"}

    # 5. Period comparison ("so sánh hôm nay với hôm qua")
    cmp_res = _handle_period_comparison(norm_q, cfg=cfg)
    if cmp_res:
        return {**cmp_res, "route": "local"}

    # 6. Superlatives (#1 best/slow product, peak hour, top staff)
    wants_list = any(k in norm_q for k in ("top ", "topmon", "danh sach", "liet ke", "cac mon"))
    if not wants_list and any(k in norm_q for k in ("ban chay nhat", "chay nhat", "ban nhieu nhat", "hot nhat", "best seller")):
        res = _answer_top_product_superlative(period_arg, slow=False, cfg=cfg)
        return {**res, "route": "local"}
    if not wants_list and any(k in norm_q for k in ("ban cham nhat", "ban it nhat", "e nhat")):
        res = _answer_top_product_superlative(period_arg, slow=True, cfg=cfg)
        return {**res, "route": "local"}
    if any(k in norm_q for k in ("gio nao dong", "khung gio dong", "gio cao diem", "gio nao ban chay", "khung gio nao ban chay", "gio nhieu don")):
        res = _answer_peak_hour_superlative(period_arg, cfg=cfg)
        return {**res, "route": "local"}
    if "nhat" in norm_q or "nhieu nhat" in norm_q:
        staff_sup = _answer_staff_superlative(norm_q, period_arg, cfg=cfg)
        if staff_sup:
            return {**staff_sup, "route": "local"}

    # 7. Narrow slices (table #N, active IPs, cash/transfer/takeaway/QR slices)
    sliced = _handle_targeted_slice(norm_q, period_arg, cfg=cfg)
    if sliced:
        return {**sliced, "route": "local"}

    # 8. Specific product or employee entity match
    ent = _handle_entity_match(norm_q, period_arg, cache, cfg=cfg)
    if ent:
        return {**ent, "route": "local"}

    return None
