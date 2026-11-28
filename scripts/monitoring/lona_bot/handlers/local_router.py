"""Unified Local NLU router combining Semantic Intent Grammar, slots, and KB fallback."""
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
from .report_sales_ops import handle_ban, handle_bep, handle_doanhthu, handle_tongquan, handle_topmon
from .report_orders_risk import handle_audit, handle_don, handle_huy, handle_khuyenmai
from .report_finance_hr import handle_ket, handle_kho, handle_lich, handle_loinhuan, handle_luong, handle_qr
from .report_digest import handle_help
from ..nlu.invocation import extract_period_phrase, is_system_doc_question
from ..nlu.system_kb import search_system_docs
from ..state.entity_cache import EntityCache
from ..state.memory import extract_slots_from_text
from ..state.telemetry import TelemetryStore

from .local_entities import _handle_entity_match, _handle_targeted_slice, _query_single_product
from .local_meta import _resolve_meta_faq
from .local_orders import _handle_recent_and_addon_orders
from .local_superlatives import (
    _answer_order_top_value,
    _answer_peak_hour_superlative,
    _answer_staff_superlative,
    _answer_top_product_superlative,
    _handle_period_comparison,
)
from ..nlu.semantic_engine import match_semantic_intent

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

    # 2. Follow-up about previously mentioned order_code ("Đơn đó là ăn tại quán hay mang đi?", "Ai thu ngân?", "Hết mấy tiền?")
    if slots.get("order_code"):
        ocode = str(slots["order_code"])
        refers_order = any(k in norm_q for k in ("don do", "don nay", "don vua roi")) or (
            len(norm_q.split()) <= 10
            and not extract_period_phrase(norm_q)
            and any(
                k in norm_q
                for k in (
                    "an tai quan", "tai quan", "tai ban", "mang di", "mang ve",
                    "ban nao", "thu ngan", "ai tao", "ai chot", "thanh toan chua",
                    "da tra tien", "bao nhieu tien", "het bao nhieu", "chi tiet",
                )
            )
        )
        if refers_order:
            ord_rows = run_readonly_sql_json(
                f"""
                SELECT o.order_code, o.order_type, o.takeaway_number, dt.name AS table_name,
                       o.status, o.payment_method, o.total_amount,
                       COALESCE(e.short_name, u.username, '—') AS cashier_name,
                       to_char(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI dd/mm') AS created_vn
                FROM orders o
                LEFT JOIN dining_tables dt ON dt.id = o.table_id
                LEFT JOIN users u ON u.id = o.cashier_id
                LEFT JOIN employees e ON e.id = u.employee_id
                WHERE UPPER(o.order_code) = UPPER({_sql_quote(ocode)})
                """,
                max_rows=1,
                cfg=cfg,
            )
            if ord_rows:
                r = ord_rows[0]
                if r.get("order_type") == "TAKEAWAY":
                    kind_txt = f"Mang về #{r.get('takeaway_number') or ''}".strip()
                else:
                    tbl = r.get("table_name") or "Tại bàn"
                    kind_txt = f"Ăn tại quán ({tbl})"
                if any(k in norm_q for k in ("chi tiet", "nhung mon", "goi gi")):
                    return {"text": handle_don(ocode, cfg=cfg), "slots": slots}
                return {
                    "text": (
                        f"🧾 Đơn <code>{html.escape(str(r['order_code']))}</code> là đơn <b>{html.escape(kind_txt)}</b> "
                        f"· Tổng: <b>{fmt_vnd(r['total_amount'])}</b> · Trạng thái: <b>{html.escape(str(r['status']))}</b> "
                        f"({html.escape(str(r.get('payment_method') or 'Chưa TT'))} · TN {html.escape(str(r['cashier_name']))} lúc {html.escape(str(r['created_vn']))})."
                    ),
                    "slots": {**slots, "table_name": r.get("table_name") or slots.get("table_name")},
                }

    # 3. Follow-up about previously mentioned table_name
    if slots.get("table_name") and any(k in norm_q for k in ("ban do", "ban nay")) and not any(k in norm_q for k in ("ban chay", "ban cham")):
        m_num = re.search(r"(\d+)", str(slots["table_name"]))
        if m_num:
            sliced_tbl = _handle_targeted_slice(f"ban {m_num.group(1)}", "", cfg=cfg)
            if sliced_tbl:
                return sliced_tbl

    # 4. Pronoun follow-up about previously mentioned product
    if slots.get("product_name"):
        pname = str(slots["product_name"])
        new_period = extract_period_phrase(norm_q)
        if any(k in norm_q for k in ("mon do", "mon nay", "no")) and any(k in norm_q for k in ("gia", "bao nhieu tien", "may tien")):
            return _query_single_product(pname, str(slots.get("period_raw") or ""), ask_price_only=True, cfg=cfg)
        if any(k in norm_q for k in ("mon do", "mon nay")) or (new_period and slots.get("intent") in ("topmon_best", "product_sales")):
            return _query_single_product(pname, new_period or str(slots.get("period_raw") or ""), cfg=cfg)

    # 5. Period-shift follow-up ("còn hôm qua?", "còn tuần trước?")
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


def _dispatch_semantic_match(sem: dict[str, Any], cfg: dict[str, str] | None = None) -> dict[str, Any] | None:
    iid = sem.get("intent_id")
    period_arg = str(sem.get("period") or "homnay")
    if iid == "product_top_popularity":
        res = _answer_top_product_superlative(period_arg, slow=False, cfg=cfg, sort_mode="quantity")
        return {**res, "route": "local_semantic", "intent_id": iid}
    if iid == "product_top_revenue":
        res = _answer_top_product_superlative(period_arg, slow=False, cfg=cfg, sort_mode="revenue")
        return {**res, "route": "local_semantic", "intent_id": iid}
    if iid == "product_slow_popularity":
        res = _answer_top_product_superlative(period_arg, slow=True, cfg=cfg)
        return {**res, "route": "local_semantic", "intent_id": iid}
    if iid in ("product_list_popularity", "product_list_revenue"):
        return {
            "text": handle_topmon(period_arg, cfg=cfg),
            "slots": {"intent": "topmon", "period_raw": period_arg},
            "route": "fast_path",
            "intent_id": iid,
        }
    if iid in ("hour_peak_density", "hour_quiet_density"):
        res = _answer_peak_hour_superlative(period_arg, cfg=cfg, quiet=(iid == "hour_quiet_density"))
        return {**res, "route": "local_semantic", "intent_id": iid}
    if iid == "staff_top_void":
        res = _answer_staff_superlative("huy don nhieu nhat", period_arg, cfg=cfg)
        return {**res, "route": "local_semantic", "intent_id": iid} if res else None
    if iid == "staff_top_orders":
        res = _answer_staff_superlative("thu ngan nhieu don nhat", period_arg, cfg=cfg)
        return {**res, "route": "local_semantic", "intent_id": iid} if res else None
    if iid == "order_top_value":
        res = _answer_order_top_value(period_arg, cfg=cfg)
        return {**res, "route": "local_semantic", "intent_id": iid}
    if iid == "table_live_status":
        return {"text": handle_ban(cfg=cfg), "slots": {"intent": "ban"}, "route": "fast_path", "intent_id": iid}
    if iid == "recent_orders":
        return {"text": handle_don(period_arg, cfg=cfg), "slots": {"intent": "don", "period_raw": period_arg}, "route": "fast_path", "intent_id": iid}
    if iid == "period_comparison":
        cmp_res = _handle_period_comparison(str(sem.get("norm_text") or ""), cfg=cfg)
        if cmp_res:
            return {**cmp_res, "route": "local_semantic", "intent_id": iid}

    fast_handlers = {
        "fast_path_overview": lambda: handle_tongquan(period_arg, cfg=cfg),
        "fast_path_revenue": lambda: handle_doanhthu(period_arg, cfg=cfg),
        "fast_path_profit": lambda: handle_loinhuan(period_arg, cfg=cfg),
        "fast_path_cashflow": lambda: handle_ket(period_arg, cfg=cfg),
        "fast_path_qr": lambda: handle_qr(cfg=cfg),
        "fast_path_kitchen": lambda: handle_bep(period_arg, cfg=cfg),
        "fast_path_inventory": lambda: handle_kho(period_arg, cfg=cfg),
        "fast_path_discounts": lambda: handle_khuyenmai(period_arg, cfg=cfg),
        "fast_path_voids": lambda: handle_huy(period_arg, cfg=cfg),
        "fast_path_audit": lambda: handle_audit("", cfg=cfg),
        "fast_path_schedule": lambda: handle_lich(period_arg, cfg=cfg),
        "fast_path_payroll": lambda: handle_luong(period_arg, cfg=cfg),
    }
    if iid in fast_handlers:
        return {
            "text": fast_handlers[iid](),
            "slots": {"intent": str(sem.get("command_equivalent") or iid), "period_raw": period_arg},
            "route": "fast_path",
            "intent_id": iid,
        }
    return None


def try_answer_locally(
    clean_q: str,
    cfg: dict[str, str] | None = None,
    slots: dict[str, Any] | None = None,
    cache: EntityCache | None = None,
    telemetry: TelemetryStore | None = None,
    cc_tags: list[str] | None = None,
    cc_honorific: str = "",
    persona_key: str = "minh_ban",
    local_enabled: bool = True,
    allow_kb_fallback: bool = False,
) -> dict[str, Any] | None:
    """
    Attempt 0-token focused resolution before calling Gemini AI.
    Returns {'text': str, 'slots': dict, 'route': str} or None to fall through to Gemini.
    """
    if not local_enabled:
        return None
    norm_q = strip_vi(clean_q)
    if not norm_q:
        return None
    cache = cache or EntityCache()

    meta = _resolve_meta_faq(
        norm_q,
        cfg=cfg,
        telemetry=telemetry,
        cc_tags=cc_tags,
        cc_honorific=cc_honorific,
        persona_key=persona_key,
    )
    if meta:
        return {**meta, "route": "local"}

    if is_system_doc_question(clean_q):
        if allow_kb_fallback:
            proj_dir = (cfg or {}).get("project_dir") or None
            if proj_dir == "/tmp":
                proj_dir = None
            chunks = search_system_docs(clean_q, project_dir=proj_dir, max_chunks=2)
            if chunks:
                body = "\n\n".join(
                    f"📘 <b>{html.escape(str(c.get('heading') or c.get('source')))}</b>\n{html.escape(str(c.get('content') or c.get('snippet') or ''))}"
                    for c in chunks
                )
                return {"text": body, "slots": {"intent": "system_kb"}, "route": "system_kb"}
        return None

    m_code = re.search(r"\b((?:HD|ORD)-[A-Z0-9-]+)\b", clean_q, re.I)
    if m_code:
        code = m_code.group(1).upper()
        return {"text": handle_don(code, cfg=cfg), "slots": {"intent": "order_detail", "order_code": code}, "route": "fast_path"}

    period_arg = extract_period_phrase(norm_q)

    # Run recent/addon & comparison & targeted slices before falling back on stale slots
    recent_res = _handle_recent_and_addon_orders(norm_q, cfg=cfg)
    if recent_res:
        return {**recent_res, "route": "local"}

    cmp_res = _handle_period_comparison(norm_q, cfg=cfg)
    if cmp_res:
        return {**cmp_res, "route": "local"}

    # Semantic Intent Grammar evaluation (handles synonyms like "bán chạy nhất" vs "được gọi nhiều nhất")
    sem = match_semantic_intent(clean_q)
    if sem.get("guard_blocked"):
        return None

    semantic_superlative_ids = {
        "product_top_popularity",
        "product_top_revenue",
        "product_slow_popularity",
        "product_list_popularity",
        "product_list_revenue",
        "hour_peak_density",
        "hour_quiet_density",
        "staff_top_void",
        "staff_top_orders",
        "order_top_value",
        "period_comparison",
    }

    if slots and not sem.get("matched"):
        fu = _handle_followup_local(norm_q, slots, cfg=cfg)
        if fu:
            return {**fu, "route": "local"}

    # High-specificity semantic superlatives run before slices/entity match
    if sem.get("matched") and sem.get("intent_id") in semantic_superlative_ids:
        dispatched = _dispatch_semantic_match(sem, cfg=cfg)
        if dispatched is not None:
            return dispatched

    # Narrow slices (table #N, active IPs, cash/transfer/takeaway/QR slices)
    sliced = _handle_targeted_slice(norm_q, period_arg, cfg=cfg)
    if sliced:
        return {**sliced, "route": "local"}

    # Specific product or employee entity match (runs BEFORE broad fast-path module reports)
    ent = _handle_entity_match(norm_q, period_arg, cache, cfg=cfg)
    if ent:
        return {**ent, "route": "local"}

    # Remaining matched semantic fast-paths (overview, revenue, cashflow, schedule, payroll, tables...)
    if sem.get("matched"):
        dispatched = _dispatch_semantic_match(sem, cfg=cfg)
        if dispatched is not None:
            return dispatched

    if slots:
        fu = _handle_followup_local(norm_q, slots, cfg=cfg)
        if fu:
            return {**fu, "route": "local"}

    return None
