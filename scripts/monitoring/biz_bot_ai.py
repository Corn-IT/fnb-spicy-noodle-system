#!/usr/bin/env python3
"""
Layer 2 & 3 Gemini AI Assistant for @POS_Lona_bot.
Strictly scoped to Ăn Vặt Tran POS business data & read-only PostgreSQL schema (fnb_bot_ro).
Supports structured tool calling (/internal/biz/*) + bounded SELECT-only SQL execution.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.error
import urllib.request
from typing import Any

from biz_bot_common import (
    call_internal_biz,
    get_biz_config,
    run_readonly_sql_json,
    sanitize_telegram_html,
    vn_today_date,
)

MAX_AI_PER_MINUTE = 15
MAX_TOOL_ROUNDS = 4

SCHEMA_SUMMARY_FOR_AI = """
Cơ sở dữ liệu PostgreSQL (fnb_pos, múi giờ kinh doanh Việt Nam Asia/Ho_Chi_Minh UTC+7):
Chỉ được truy vấn các bảng/view và cột sau (KHÔNG TỒN TẠI bất kỳ cột mật khẩu/CCCD/số TK ngân hàng gốc/QR token nào):
- orders(id, order_code, order_type['DINE_IN'|'TAKEAWAY'], order_source['POS_COUNTER'|'QR_CODE'], table_id, takeaway_number, status['PENDING'|'SERVING'|'PAID'|'VOIDED'], payment_method['CASH'|'TRANSFER'|'SPLIT'], payment_account_id, cash_amount, transfer_amount, subtotal_amount, discount_amount, discount_id, discount_snapshot, total_amount, cashier_id, note, void_reason, pending_payment_edit, created_at, paid_at)
- order_items(id, order_id, product_id, quantity, unit_price, modifiers_snapshot, item_note, batch_no, item_source, kitchen_status['NEW'|'PRINTED'|'CANCELLED'], is_takeaway, created_at)
- dining_tables(id, name, status['AVAILABLE'|'PENDING'|'OCCUPIED'], active_order_id)
- products(id, name, subtitle, category_id, price, station['BEP_NAU'|'BEP_CHIEN'|'PHA_CHE'|'COMBO'], is_available, sort_order)
- combo_items(parent_product_id, child_product_id, quantity)
- master_data(id, category, name, normalized_name, is_active) -- category gồm MENU_CATEGORY, INGREDIENT, SUPPLIER, UNIT, POSITION, SPECIALTY, KITCHEN_STATION
- inventory_imports(id, ingredient_mdm_id, supplier_mdm_id, supplier_name_snapshot, item_name_snapshot, unit_name, unit_price, quantity, total_cost, payment_source['CASH_DRAWER'|'EXTERNAL'], import_date, note, is_deleted, created_at)
- cash_drawer_settlements(id, settlement_date, shift_name, opening_budget, total_cash_sales, total_transfer_sales, total_cash_imports, expected_cash_in_drawer, actual_counted_cash, discrepancy_amount, status['MATCHED'|'SURPLUS'|'SHORTAGE'], note, closed_by, created_at)
- discounts(id, code, name, value_type['PERCENT'|'FIXED'], value, max_discount_amount, scope, min_order_amount, starts_at, ends_at, usage_limit, used_count, is_active, is_archived)
- work_schedules(id, week_start_date, day_of_week[0=T2..6=CN], time_slot, employee_ids)
- employees(id, full_name, short_name, position_id, specialty_id, start_date, is_deleted)
- users(id, employee_id, username, is_super_admin, role_label, is_active)
- v_bot_payment_accounts(id, label, bank_code, account_no_masked, account_name, priority, is_active, daily_limit, monthly_limit, yearly_limit)
- audit_logs(id, module, action, actor_id, actor_full_name, actor_username, summary, metadata, created_at)

QUY TẮC NGHIỆP VỤ BẮT BUỘC:
1. Doanh thu thực thu CHỈ tính từ orders WHERE status = 'PAID' lọc theo paid_at (quy về ngày VN: paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'). KHÔNG BAO GIỜ tính đơn VOIDED vào doanh thu.
2. Tiền mặt = CASE WHEN payment_method='CASH' THEN total_amount WHEN payment_method='SPLIT' THEN cash_amount ELSE 0 END. Chuyển khoản = TRANSFER total_amount + SPLIT transfer_amount.
3. Món bán ra phải lọc order_items WHERE kitchen_status <> 'CANCELLED' thuộc đơn status = 'PAID'.
4. Nhập kho chỉ lấy WHERE is_deleted = FALSE. Chỉ payment_source = 'CASH_DRAWER' mới trừ vào két tiền mặt.
""".strip()

TOOL_DECLARATIONS = [
    {
        "name": "get_store_overview",
        "description": "Lấy toàn bộ báo cáo tổng quan (doanh thu, tăng trưởng vs kỳ trước, dòng tiền, két tiền, nhập kho, lợi nhuận, top món, bàn đang mở, trạm bếp, khuyến mãi, rủi ro) từ logic chuẩn của NestJS backend.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "from_date": {"type": "STRING", "description": "Ngày bắt đầu YYYY-MM-DD (giờ VN)"},
                "to_date": {"type": "STRING", "description": "Ngày kết thúc YYYY-MM-DD (giờ VN)"},
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_item_sales",
        "description": "Lấy bảng thống kê bán hàng chi tiết theo từng món ăn/thức uống trong khoảng ngày (số lượng, doanh thu, số đơn, tỷ trọng).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "from_date": {"type": "STRING", "description": "Ngày bắt đầu YYYY-MM-DD"},
                "to_date": {"type": "STRING", "description": "Ngày kết thúc YYYY-MM-DD"},
                "station": {"type": "STRING", "description": "Tùy chọn: ALL, BEP_NAU, BEP_CHIEN, PHA_CHE, COMBO"},
                "search": {"type": "STRING", "description": "Tùy chọn từ khóa tên món"},
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_cashflow_status",
        "description": "Lấy đối soát két tiền hôm nay và danh sách lịch sử chốt ca.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "from_date": {"type": "STRING", "description": "Ngày bắt đầu YYYY-MM-DD"},
                "to_date": {"type": "STRING", "description": "Ngày kết thúc YYYY-MM-DD"},
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_payroll_summary",
        "description": "Lấy bảng công & quỹ lương ước tính chi tiết theo từng nhân viên trong khoảng ngày.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "from_date": {"type": "STRING", "description": "Ngày bắt đầu YYYY-MM-DD"},
                "to_date": {"type": "STRING", "description": "Ngày kết thúc YYYY-MM-DD"},
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_work_schedule",
        "description": "Lấy lịch làm việc nhân viên của một tuần (week_start_date bắt buộc là Thứ Hai YYYY-MM-DD).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "week_start_date": {"type": "STRING", "description": "Ngày Thứ Hai đầu tuần YYYY-MM-DD"},
            },
            "required": ["week_start_date"],
        },
    },
    {
        "name": "run_readonly_sql",
        "description": "Chạy truy vấn PostgreSQL SELECT chỉ đọc qua role fnb_bot_ro (tối đa 50 dòng) cho các câu hỏi ad-hoc mà 5 tools trên chưa đủ chi tiết.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "sql": {"type": "STRING", "description": "Câu lệnh SELECT hoặc WITH...SELECT hợp lệ cho PostgreSQL 16"},
                "purpose": {"type": "STRING", "description": "Mục đích ngắn gọn của truy vấn"},
            },
            "required": ["sql"],
        },
    },
]


class AiRateLimiter:
    def __init__(self, max_per_min: int = MAX_AI_PER_MINUTE) -> None:
        self.max_per_min = max_per_min
        self._timestamps: list[float] = []

    def allow(self) -> bool:
        now = time.monotonic()
        self._timestamps = [t for t in self._timestamps if now - t < 60.0]
        if len(self._timestamps) >= self.max_per_min:
            return False
        self._timestamps.append(now)
        return True


def _build_system_instruction(today: dt.date | None = None) -> str:
    today = today or vn_today_date()
    weekdays = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
    monday = today - dt.timedelta(days=today.weekday())
    return f"""
Bạn là Trợ lý Thống kê Kinh doanh thông minh của quán "Ăn Vặt Tran" (POS Lona, miền pos.anvattran.com).
Hôm nay theo giờ Việt Nam (UTC+7) là {weekdays[today.weekday()]}, ngày {today.strftime('%d/%m/%Y')} (ISO: {today.isoformat()}, Thứ Hai đầu tuần này: {monday.isoformat()}).

PHẠM VI BẮT BUỘC:
- CHỈ trả lời câu hỏi liên quan đến dữ liệu vận hành, kinh doanh, đơn hàng, doanh thu, két tiền, bàn, thực đơn, trạm bếp, nhập kho, khuyến mãi, nhân sự, lịch làm, bảng lương, tài khoản VietQR và nhật ký kiểm toán của hệ thống POS Ăn Vặt Tran.
- Nếu câu hỏi nằm NGOÀI phạm vi hệ thống/database quán (như thời tiết, tin tức, chính trị, viết code, làm toán ngoài, kiến thức đời sống chung), BẮT BUỘC từ chối ngắn gọn: "🤖 Tôi chỉ hỗ trợ tra cứu và phân tích dữ liệu kinh doanh của hệ thống POS Ăn Vặt Tran."
- TUYỆT ĐỐI KHÔNG BỊA SỐ LIỆU. Mọi con số phải lấy từ kết quả gọi tool thực tế. Nếu không có dữ liệu thì nói rõ là không có.
- Ưu tiên dùng các tools chuẩn (get_store_overview, get_item_sales, get_cashflow_status, get_payroll_summary, get_work_schedule) trước; chỉ dùng run_readonly_sql khi cần lọc chi tiết hơn (ví dụ theo thu ngân, theo món cụ thể, cấp độ cay, bàn đang ngồi, khung giờ đặc thù).
- Định dạng trả lời: tiếng Việt tự nhiên, súc tích, dễ đọc trên điện thoại. Chỉ sử dụng thẻ HTML Telegram đơn giản (<b>, <code>, <i>), KHÔNG dùng Markdown ** hoặc ##.
- Định dạng tiền tệ Việt Nam: 1.250.000đ.

{SCHEMA_SUMMARY_FOR_AI}
""".strip()


def execute_ai_tool(name: str, args: dict[str, Any], cfg: dict[str, str] | None = None) -> dict[str, Any]:
    try:
        if name == "get_store_overview":
            res = call_internal_biz(
                "/internal/biz/overview",
                {"fromDate": args.get("from_date"), "toDate": args.get("to_date")},
                cfg=cfg,
            )
            # Trim heavy tables/audit arrays to keep LLM context focused & fast
            if isinstance(res.get("liveTables"), dict):
                tables = res["liveTables"].get("tables") or []
                res["liveTables"]["tables"] = [t for t in tables if t.get("status") != "AVAILABLE"][:25]
            return {"ok": True, "data": res}

        if name == "get_item_sales":
            res = call_internal_biz(
                "/internal/biz/daily-items",
                {
                    "fromDate": args.get("from_date"),
                    "toDate": args.get("to_date"),
                    "station": args.get("station"),
                    "search": args.get("search"),
                },
                cfg=cfg,
            )
            if isinstance(res.get("items"), list):
                res["items"] = res["items"][:30]
            return {"ok": True, "data": res}

        if name == "get_cashflow_status":
            preview = call_internal_biz("/internal/biz/cashflow/preview", cfg=cfg)
            settlements = call_internal_biz(
                "/internal/biz/cashflow/settlements",
                {"page": 1, "limit": 10, "fromDate": args.get("from_date"), "toDate": args.get("to_date")},
                cfg=cfg,
            )
            return {"ok": True, "previewToday": preview, "settlements": settlements}

        if name == "get_payroll_summary":
            res = call_internal_biz(
                "/internal/biz/payroll",
                {"fromDate": args.get("from_date"), "toDate": args.get("to_date")},
                cfg=cfg,
            )
            return {"ok": True, "data": res}

        if name == "get_work_schedule":
            res = call_internal_biz(
                "/internal/biz/schedule",
                {"weekStartDate": args.get("week_start_date")},
                cfg=cfg,
            )
            return {"ok": True, "data": res}

        if name == "run_readonly_sql":
            rows = run_readonly_sql_json(str(args.get("sql", "")), max_rows=50, cfg=cfg)
            return {"ok": True, "rowCount": len(rows), "rows": rows}

        return {"ok": False, "error": f"Unknown tool: {name}"}
    except Exception as err:
        return {"ok": False, "error": str(err)[:300]}


def _call_gemini(
    contents: list[dict[str, Any]],
    system_instruction: str,
    cfg: dict[str, str],
) -> dict[str, Any]:
    api_key = cfg.get("gemini_api_key", "").strip()
    if not api_key:
        raise RuntimeError("Chưa cấu hình FNB_GEMINI_API_KEY")

    payload = json.dumps({
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1200,
        },
    }).encode("utf-8")

    models_to_try = [cfg["gemini_model"]]
    if cfg.get("gemini_fallback_model") and cfg["gemini_fallback_model"] not in models_to_try:
        models_to_try.append(cfg["gemini_fallback_model"])

    last_err: Exception | None = None
    for idx, model in enumerate(models_to_try):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=18) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            body_err = err.read().decode("utf-8", "replace")[:260]
            last_err = RuntimeError(f"Gemini HTTP {err.code}: {body_err}")
            if idx + 1 < len(models_to_try) and err.code in (404, 429, 500, 503):
                continue
            raise last_err from err
        except Exception as err:
            last_err = err
            if idx + 1 < len(models_to_try):
                continue
            raise
    assert last_err is not None
    raise last_err


def _extract_model_parts(resp: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    candidates = resp.get("candidates") or []
    if not candidates:
        return [], [], ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    func_calls: list[dict[str, Any]] = []
    texts: list[str] = []
    for part in parts:
        if isinstance(part, dict):
            if "functionCall" in part and isinstance(part["functionCall"], dict):
                func_calls.append(part["functionCall"])
            elif isinstance(part.get("text"), str) and not part.get("thought"):
                texts.append(part["text"])
    return parts, func_calls, "\n".join(texts).strip()


def answer_with_gemini(
    question: str,
    cfg: dict[str, str] | None = None,
    rate_limiter: AiRateLimiter | None = None,
) -> str:
    cfg = cfg or get_biz_config()
    clean_q = re.sub(r"@pos_lona_bot\b", "", question or "", flags=re.I).strip()
    if not clean_q:
        return "🤖 Bạn hãy nhập câu hỏi liên quan đến hoạt động quán Ăn Vặt Tran nhé!"

    if rate_limiter and not rate_limiter.allow():
        return "⏳ Nhóm đang hỏi AI hơi dồn dập (tối đa 15 câu/phút). Vui lòng thử lại sau ít giây hoặc dùng lệnh <code>/tongquan</code>, <code>/doanhthu</code>..."

    sys_inst = _build_system_instruction()
    contents: list[dict[str, Any]] = [
        {"role": "user", "parts": [{"text": clean_q}]}
    ]

    for _ in range(MAX_TOOL_ROUNDS):
        resp = _call_gemini(contents, sys_inst, cfg)
        model_parts, func_calls, text_reply = _extract_model_parts(resp)

        if not func_calls:
            if text_reply:
                return sanitize_telegram_html(text_reply)
            break

        contents.append({"role": "model", "parts": model_parts})
        fn_responses = []
        for fc in func_calls:
            fn_name = str(fc.get("name", ""))
            fn_args = fc.get("args") if isinstance(fc.get("args"), dict) else {}
            result = execute_ai_tool(fn_name, fn_args, cfg=cfg)
            fn_responses.append({
                "functionResponse": {
                    "name": fn_name,
                    "response": result,
                }
            })
        contents.append({"role": "user", "parts": fn_responses})

    return "🤖 Xin lỗi, mình chưa tổng hợp được câu trả lời cho câu hỏi này. Bạn có thể hỏi ngắn gọn hơn hoặc dùng <code>/help</code> để xem các lệnh sẵn có."
