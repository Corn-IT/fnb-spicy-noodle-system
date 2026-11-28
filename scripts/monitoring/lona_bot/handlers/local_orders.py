"""Recent N-minute order feed and addon-batch lookup handlers (0-token)."""

from __future__ import annotations

import html
import re
from typing import Any

from ..core.internal_api import run_readonly_sql_json
from ..core.vi_text import fmt_vnd


def _handle_recent_and_addon_orders(norm_q: str, cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    if any(k in norm_q for k in ("goi them", "them mon", "mon bo sung", "order them", "vua them")):
        rows = run_readonly_sql_json(
            """
            SELECT o.order_code, o.order_type, o.takeaway_number, dt.name AS table_name, o.status, o.total_amount,
                   p.name AS product_name, oi.quantity, oi.batch_no,
                   to_char(oi.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS added_hm
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id
            LEFT JOIN dining_tables dt ON dt.id = o.table_id
            WHERE oi.kitchen_status <> 'CANCELLED'
              AND oi.batch_no > 1
              AND (oi.created_at >= NOW() - INTERVAL '45 minutes' OR o.status IN ('PENDING', 'SERVING'))
              AND o.created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
            ORDER BY oi.created_at DESC, oi.id DESC
            """,
            max_rows=20,
            cfg=cfg,
        )
        if not rows:
            return {"text": "📋 Hiện chưa ghi nhận đơn nào gọi thêm món (batch bổ sung) gần đây.", "slots": {"intent": "addon_orders"}}

        grouped: dict[str, dict[str, Any]] = {}
        for r in rows:
            code = str(r["order_code"])
            if code not in grouped:
                loc = r.get("table_name") or (f"Mang về #{r['takeaway_number']}" if r.get("takeaway_number") else "Mang về")
                grouped[code] = {"loc": loc, "status": r["status"], "total": r["total_amount"], "items": []}
            grouped[code]["items"].append(f"{r['quantity']}x {r['product_name']} ({r['added_hm']})")

        top_code = next(iter(grouped))
        lines = [f"➕ <b>ĐƠN VỪA GỌI THÊM MÓN ({len(grouped)} đơn)</b>"]
        for code, info in list(grouped.items())[:5]:
            items_txt = ", ".join(html.escape(it) for it in info["items"][:5])
            lines.append(
                f"• <code>{html.escape(code)}</code> ({html.escape(str(info['loc']))} · {fmt_vnd(info['total'])}) "
                f"[{html.escape(str(info['status']))}]: {items_txt}"
            )
        return {"text": "\n".join(lines), "slots": {"intent": "addon_orders", "order_code": top_code}}

    m_mins = re.search(r"\b(\d{1,3})\s*(phut|tieng|gio)\b", norm_q)
    asks_recent = (bool(m_mins) or any(k in norm_q for k in ("vua nay", "moi day", "vua moi", "gan day nhat"))) and not any(
        sig in norm_q for sig in ("phan tich", "xu huong", "giai thich", "nhan xet", "de xuat")
    )
    if asks_recent and any(k in norm_q for k in ("don", "hoa don", "khach nao", "co gi", "tao nao")):
        if m_mins:
            val = int(m_mins.group(1))
            mins = max(1, min(1440, val * 60 if m_mins.group(2) in ("tieng", "gio") else val))
            window_label = f"{val} phút" if m_mins.group(2) == "phut" else f"{val} giờ"
        else:
            mins = 15
            window_label = "15 phút vừa qua"

        rows = run_readonly_sql_json(
            f"""
            SELECT o.order_code, o.order_type, o.takeaway_number, dt.name AS table_name,
                   o.status, o.total_amount,
                   to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS created_hm
            FROM orders o
            LEFT JOIN dining_tables dt ON dt.id = o.table_id
            WHERE o.created_at >= NOW() - INTERVAL '{mins} minutes'
            ORDER BY o.created_at DESC, o.id DESC
            """,
            max_rows=12,
            cfg=cfg,
        )
        if not rows:
            return {
                "text": f"🔎 Trong <b>{html.escape(window_label)}</b> gần đây chưa có đơn hàng nào mới.",
                "slots": {"intent": "recent_orders"},
            }
        lines = [f"🕒 <b>ĐƠN HÀNG TRONG {html.escape(window_label.upper())} GẦN ĐÂY ({len(rows)} đơn)</b>"]
        for r in rows[:8]:
            loc = r.get("table_name") or (f"Mang về #{r['takeaway_number']}" if r.get("takeaway_number") else "Mang về")
            lines.append(
                f"• <code>{html.escape(str(r['order_code']))}</code> ({html.escape(str(loc))}) — "
                f"<b>{fmt_vnd(r['total_amount'])}</b> [{html.escape(str(r['status']))}] lúc {html.escape(str(r['created_hm']))}"
            )
        return {
            "text": "\n".join(lines),
            "slots": {"intent": "recent_orders", "order_code": str(rows[0]["order_code"])},
        }
    return None
