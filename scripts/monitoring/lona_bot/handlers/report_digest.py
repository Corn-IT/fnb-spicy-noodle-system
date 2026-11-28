"""Help card and scheduled daily/weekly business digests."""
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

from .report_helpers import SETTLEMENT_STATUS_VI, _fmt_growth, _overview, _proj
from .report_sales_ops import handle_topmon
from .report_orders_risk import handle_huy
from .report_finance_hr import handle_lich

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
        "• VD 0-token: <i>\"Lona ơi món nào bán chạy nhất tuần này?\"</i>, <i>\"Bot đơn vừa gọi thêm?\"</i>",
        "• Lệnh kiểm tra AI: <code>/token</code> hoặc <code>/gemini</code> (trạng thái Key, Model, giờ reset quota, tỷ lệ 0-token)",
        "• Lệnh phụ: <code>/hoi &lt;câu hỏi&gt;</code>, <code>/quen</code> (xóa ngữ cảnh)",
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
