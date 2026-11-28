#!/usr/bin/env python3
"""
Lightweight 2-minute Business Alert Probe for @POS_Lona_bot (anti-spam state deduplication):
1. VietQR bank accounts reaching >=80% near-limit or 100% FULL (day/month/year).
2. Pending payment method edit requests awaiting manager approval.
3. Newly voided orders (VOIDED) >= FNB_BIZ_HIGH_VOID_THRESHOLD (default 150,000đ).
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path
from typing import Any

from biz_bot_common import (
    call_internal_biz,
    fmt_vnd,
    get_biz_config,
    run_readonly_sql_json,
    send_tg_message,
    vn_now_str,
    vn_today_date,
)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"date": "", "qr_levels": {}, "pending_edits": [], "voided_ids": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {"date": "", "qr_levels": {}, "pending_edits": [], "voided_ids": []}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def collect_business_alerts(
    overview: dict[str, Any],
    void_rows: list[dict[str, Any]],
    state: dict[str, Any],
    today_iso: str,
    high_void_threshold: int,
) -> tuple[list[str], dict[str, Any]]:
    proj = html.escape(overview.get("_project_name", "Ăn Vặt Tran"))
    if state.get("date") != today_iso:
        next_state: dict[str, Any] = {
            "date": today_iso,
            "qr_levels": {},
            "pending_edits": [],
            "voided_ids": [],
        }
    else:
        next_state = {
            "date": today_iso,
            "qr_levels": dict(state.get("qr_levels") or {}),
            "pending_edits": list(state.get("pending_edits") or []),
            "voided_ids": list(state.get("voided_ids") or []),
        }

    messages: list[str] = []

    # 1. VietQR account limit warnings (>=80% or FULL)
    qr_levels: dict[str, str] = next_state["qr_levels"]
    for acc in overview.get("paymentQrAccounts") or []:
        if not acc.get("isActive"):
            continue
        acc_id = str(acc["id"])
        status = acc.get("status", "ACTIVE")
        daily_lim = acc.get("dailyLimit")
        used_day = float(acc.get("usedDay", 0) or 0)
        day_pct = round(used_day * 100 / daily_lim) if daily_lim else 0

        level = ""
        if status in ("DAY_FULL", "MONTH_FULL", "YEAR_FULL"):
            level = status
        elif status == "NEAR_LIMIT" or (daily_lim and day_pct >= 80):
            level = "NEAR_80"
        elif daily_lim and day_pct < 75 and acc_id in qr_levels:
            qr_levels.pop(acc_id, None)

        if level and qr_levels.get(acc_id) != level:
            qr_levels[acc_id] = level
            is_full = level != "NEAR_80"
            icon = "🚨" if is_full else "⚠️"
            title = "TÀI KHOẢN QR ĐÃ ĐẦY HẠN MỨC" if is_full else "TÀI KHOẢN QR SẮP CHẠM HẠN MỨC"
            messages.append("\n".join([
                f"{icon} <b>[{proj}] {title}</b>",
                "────────────────",
                f"• Tài khoản: <b>{html.escape(str(acc['label']))}</b> ({html.escape(str(acc['bankCode']))} · <code>{html.escape(str(acc.get('accountNo', '****')))}</code>)",
                f"• Đã nhận hôm nay: <b>{fmt_vnd(used_day)}</b>" + (f" / {fmt_vnd(daily_lim)} ({day_pct}%)" if daily_lim else ""),
                f"• Trạng thái: <b>{html.escape(status)}</b>",
                f"🕒 Lúc: {vn_now_str()}",
            ]))

    # 2. Pending payment method edit requests
    seen_edits = set(next_state["pending_edits"])
    pending_edits = ((overview.get("alerts") or {}).get("pendingPaymentEdits")) or []
    active_edit_keys = set()
    for ed in pending_edits:
        key = f"{ed.get('orderId')}:{ed.get('requestedAt')}"
        active_edit_keys.add(key)
        if key not in seen_edits:
            messages.append("\n".join([
                f"🔔 <b>[{proj}] YÊU CẦU DUYỆT SỬA THANH TOÁN</b>",
                "────────────────",
                f"• Đơn: <code>{html.escape(str(ed['orderCode']))}</code> ({html.escape(str(ed['tableLabel']))})",
                f"• Số tiền: <b>{fmt_vnd(ed.get('totalAmount', 0))}</b>",
                f"• Đổi PTTT: {html.escape(str(ed.get('currentMethod') or '—'))} → <b>{html.escape(str(ed.get('requestedMethod')))}</b>",
                f"• Người đề xuất: {html.escape(str(ed.get('requestedByName') or '—'))}",
                f"🕒 Lúc: {vn_now_str()}",
            ]))
    next_state["pending_edits"] = sorted(active_edit_keys)

    # 3. High-value VOIDED orders today
    seen_voids = set(str(x) for x in next_state["voided_ids"])
    for v in void_rows:
        oid = str(v["id"])
        est_amount = float(v.get("est_amount", 0) or 0)
        if oid not in seen_voids and est_amount >= high_void_threshold:
            seen_voids.add(oid)
            messages.append("\n".join([
                f"🚨 <b>[{proj}] CẢNH BÁO HỦY ĐƠN GIÁ TRỊ CAO</b>",
                "────────────────",
                f"• Mã đơn: <code>{html.escape(str(v['order_code']))}</code>",
                f"• Giá trị ước tính: <b>{fmt_vnd(est_amount)}</b> (Ngưỡng {fmt_vnd(high_void_threshold)})",
                f"• Nhân viên: {html.escape(str(v.get('actor_name') or 'Hệ thống'))}",
                f"• Lý do: <i>{html.escape(str(v.get('void_reason') or 'Không ghi rõ'))}</i>",
                f"🕒 Lúc: {vn_now_str()}",
            ]))
    next_state["voided_ids"] = sorted(seen_voids)[-200:]

    return messages, next_state


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe business alerts for @POS_Lona_bot")
    parser.add_argument("--stdout", action="store_true", help="Print alert messages to stdout instead of Telegram")
    parser.add_argument("--dry-run", action="store_true", help="Do not persist state file or send Telegram")
    args = parser.parse_args()

    cfg = get_biz_config()
    if not args.stdout and (not cfg["bot_token"] or not cfg["chat_id"]):
        return 0

    today = vn_today_date()
    today_iso = today.isoformat()
    threshold = int(cfg["high_void_threshold"])
    state_path = Path(cfg["alert_state_file"])
    state = load_state(state_path)

    overview = call_internal_biz("/internal/biz/overview", {"preset": "today", "fromDate": today_iso, "toDate": today_iso}, cfg=cfg)
    overview["_project_name"] = cfg["project_name"]

    void_rows = run_readonly_sql_json(
        f"""
        SELECT
          o.id,
          o.order_code,
          GREATEST(
            o.total_amount,
            COALESCE((SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0)
          ) AS est_amount,
          COALESCE(o.void_reason, 'Không rõ lý do') AS void_reason,
          COALESCE(e.short_name, u.username, 'Hệ thống') AS actor_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.cashier_id
        LEFT JOIN employees e ON e.id = u.employee_id
        WHERE o.status = 'VOIDED'
          AND o.created_at >= '{today_iso} 00:00:00+07'
        ORDER BY o.id DESC
        """,
        max_rows=20,
        cfg=cfg,
    )

    messages, next_state = collect_business_alerts(overview, void_rows, state, today_iso, threshold)

    if args.stdout:
        for m in messages:
            print(m)
            print("---")
        if not messages:
            print("NO_NEW_BUSINESS_ALERTS")
    else:
        for m in messages:
            send_tg_message(cfg["bot_token"], cfg["chat_id"], m)

    if not args.dry_run:
        save_state(state_path, next_state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
