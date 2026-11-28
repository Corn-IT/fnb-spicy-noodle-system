"""Deterministic Vietnamese Semantic Intent Grammar engine mirroring @fnb/shared."""

from __future__ import annotations

import re
from typing import Any

from ..core.vi_text import strip_vi
from .invocation import strip_bot_addressing
from .semantic_spec import has_phrase, load_semantic_spec

_ORDER_CODE_RE = re.compile(r"\b((?:ORD|HD)-[A-Za-z0-9-]+)\b", re.I)
_TABLE_NO_RE = re.compile(r"\bban(?:\s+so)?\s*#?(\d{1,3})\b")
_TOP_LIMIT_RE = re.compile(
    r"\btop\s*(\d{1,2})\b|\b(\d{1,2})\s+(?:mon|don(?:\s+mang\s+ve|\s+tai\s+ban|\s+tai\s+quan)?|hoa\s+don|cai|ban)\b"
)
_WORD_LIMIT_RE = re.compile(
    r"\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+(?:don(?:\s+mang\s+ve|\s+tai\s+ban|\s+tai\s+quan)?|hoa\s+don|mon|cai)\b"
)
_VI_SMALL_NUMBERS = {
    "mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5,
    "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10,
}


def extract_period_code(raw_or_norm: str, spec: dict[str, Any] | None = None) -> tuple[str, str, bool]:
    cfg = spec or load_semantic_spec()
    norm_text = strip_vi(raw_or_norm)
    for rule in cfg.get("periodRules") or ():
        if has_phrase(norm_text, rule.get("phrases") or ()):
            return str(rule["period"]), str(rule["label"]), True
    return "homnay", "Hôm nay", False


def extract_limit_with_flag(raw_or_norm: str, fallback: int = 5) -> tuple[int, bool]:
    norm_text = strip_vi(raw_or_norm)
    m = _TOP_LIMIT_RE.search(norm_text)
    if m:
        val = int(m.group(1) or m.group(2))
        if val >= 1:
            return min(20, max(1, val)), True
    mw = _WORD_LIMIT_RE.search(norm_text)
    if mw:
        val = _VI_SMALL_NUMBERS.get(mw.group(1), 0)
        if val >= 1:
            return val, True
    return fallback, False


def extract_top_limit(raw_or_norm: str, fallback: int = 5) -> int:
    return extract_limit_with_flag(raw_or_norm, fallback=fallback)[0]


def extract_order_type_filter(raw_or_norm: str) -> str | None:
    norm_text = strip_vi(raw_or_norm)
    if has_phrase(norm_text, ["mang ve", "takeaway", "mua ve", "ship", "giao di", "don ngoai"]):
        return "TAKEAWAY"
    if has_phrase(norm_text, ["tai ban", "an tai quan", "tai quan", "tai cho", "dine in"]):
        return "DINE_IN"
    return None


def _detect_entities(raw_lower: str, norm_text: str, spec: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for entity_key, rule in (spec.get("entities") or {}).items():
        if not has_phrase(norm_text, rule.get("keywords") or ()):
            continue
        disamb = rule.get("accentDisambiguation") or {}
        if any(bad in raw_lower for bad in disamb.get("requireNoneRaw") or ()):
            continue
        disqualify_sell = disamb.get("disqualifyIfRawOnly") or ()
        if disqualify_sell and any(w in raw_lower for w in disqualify_sell):
            has_table_cue = "bàn" in raw_lower or has_phrase(
                norm_text, ["ban trong", "ban dang", "ban so", "cho ngoi", "mang ve"]
            )
            if not has_table_cue:
                continue
        found.append(entity_key)
    return found


def _detect_metrics(norm_text: str, spec: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for metric_key, phrases in (spec.get("metrics") or {}).items():
        if has_phrase(norm_text, phrases or ()):
            found.append(metric_key)
    return found


def _build_result(
    intent_id: str,
    route_hint: str,
    base: dict[str, Any],
    intent_map: dict[str, dict[str, Any]],
    confidence: float,
) -> dict[str, Any]:
    defn = intent_map.get(intent_id) or {}
    return {
        **base,
        "matched": True,
        "intent_id": intent_id,
        "route_hint": route_hint,
        "required_permission": defn.get("requiredPermission") or "authenticated",
        "command_equivalent": defn.get("commandEquivalent"),
        "sort_by": defn.get("sortBy"),
        "mode": defn.get("mode"),
        "guard_blocked": False,
        "guard_id": None,
        "confidence": confidence,
    }


def match_semantic_intent(raw_text: str, bot_username: str = "POS_Lona_bot") -> dict[str, Any]:
    """Classify Vietnamese query semantically at 0 tokens across synonymous phrasings."""
    spec = load_semantic_spec()
    clean_text = strip_bot_addressing(raw_text or "", bot_username=bot_username) or (raw_text or "").strip()
    norm_clean = strip_vi(clean_text)
    raw_lower = clean_text.lower()
    period, period_label, explicit_period = extract_period_code(norm_clean, spec=spec)
    entities = _detect_entities(raw_lower, norm_clean, spec)
    metrics = _detect_metrics(norm_clean, spec)
    order_m = _ORDER_CODE_RE.search(clean_text)
    table_m = _TABLE_NO_RE.search(norm_clean)
    intent_map = {str(d["id"]): d for d in (spec.get("intentDefinitions") or []) if isinstance(d, dict) and d.get("id")}
    top_limit, explicit_limit = extract_limit_with_flag(norm_clean, 5)
    order_type_filter = extract_order_type_filter(norm_clean)

    base = {
        "clean_text": clean_text,
        "norm_text": norm_clean,
        "entities": entities,
        "metrics": metrics,
        "period": period,
        "period_label": period_label,
        "explicit_period": explicit_period,
        "top_limit": top_limit,
        "explicit_limit": explicit_limit,
        "order_type_filter": order_type_filter,
        "order_code": order_m.group(1).upper() if order_m else None,
        "table_number": int(table_m.group(1)) if table_m else None,
    }

    if has_phrase(norm_clean, spec.get("systemDocCues") or ()) and not has_phrase(
        norm_clean, ["hom nay", "hom qua", "tuan nay", "thang nay"]
    ):
        return _build_result("system_docs", "system_kb", base, intent_map, 0.96)

    for guard in spec.get("negativeGuards") or ():
        if has_phrase(norm_clean, guard.get("phrases") or ()):
            return {
                **base,
                "matched": False,
                "intent_id": None,
                "route_hint": "gemini_fallback",
                "required_permission": None,
                "command_equivalent": None,
                "sort_by": None,
                "mode": None,
                "guard_blocked": True,
                "guard_id": guard.get("id"),
                "confidence": 0.0,
            }

    card = spec.get("cardinality") or {}
    has_superlative = has_phrase(norm_clean, card.get("superlativeCues") or ())
    has_list_cue = has_phrase(norm_clean, card.get("listCues") or ())
    has_e = set(entities).__contains__
    has_m = set(metrics).__contains__

    if has_phrase(norm_clean, ["so sanh", "so voi", "chenh lech", "tang hay giam", "vs "]) and has_phrase(
        norm_clean, ["hom qua", "tuan truoc", "thang truoc"]
    ):
        cmp_p = "thang" if "thang" in norm_clean else ("tuan" if "tuan" in norm_clean else "homnay")
        cmp_lbl = "Tháng này" if cmp_p == "thang" else ("Tuần này" if cmp_p == "tuan" else "Hôm nay")
        return _build_result("period_comparison", "local_semantic", {**base, "period": cmp_p, "period_label": cmp_lbl}, intent_map, 0.94)

    implicit_product = has_e("product") or has_m("popularity_high") or has_m("popularity_low")
    if implicit_product and not (has_e("hour") or has_e("staff") or has_e("void") or has_e("table")):
        if has_m("popularity_low"):
            return _build_result("product_slow_popularity", "local_semantic", base, intent_map, 0.95)
        if has_m("revenue_high") and has_e("product"):
            iid = "product_list_revenue" if has_list_cue else "product_top_revenue"
            return _build_result(iid, "local_semantic", base, intent_map, 0.95)
        if has_m("popularity_high") or (has_e("product") and has_superlative and has_phrase(norm_clean, ["nhieu", "chay", "hot"])):
            iid = "product_list_popularity" if has_list_cue else "product_top_popularity"
            return _build_result(iid, "local_semantic", base, intent_map, 0.97)

    if has_e("hour"):
        if has_m("density_low") or has_phrase(norm_clean, ["it khach nhat", "vang nhat"]):
            return _build_result("hour_quiet_density", "local_semantic", base, intent_map, 0.92)
        if has_m("density_high") or has_m("popularity_high") or has_m("revenue_high") or has_superlative:
            return _build_result("hour_peak_density", "local_semantic", base, intent_map, 0.95)

    if has_e("staff") or has_e("void"):
        if has_m("void_action") or (has_e("staff") and has_e("void")):
            return _build_result("staff_top_void", "local_semantic", base, intent_map, 0.94)
        if has_e("staff") and (has_m("popularity_high") or has_m("density_high") or has_m("revenue_high") or has_superlative):
            return _build_result("staff_top_orders", "local_semantic", base, intent_map, 0.93)

    if base["order_code"]:
        return _build_result("fast_path_overview", "fast_path", base, intent_map, 0.85)

    if (
        not has_e("void")
        and not has_e("staff")
        and not has_e("revenue")
        and not has_e("profit")
        and not has_e("qr")
        and (has_e("order") or (order_type_filter is not None and (has_m("recent_list") or has_m("count_query"))))
    ):
        if has_m("revenue_high") and has_superlative:
            return _build_result("order_top_value", "local_semantic", base, intent_map, 0.93)
        if has_m("recent_list"):
            return _build_result("recent_orders", "local_semantic", base, intent_map, 0.94)
        if has_m("count_query"):
            return _build_result("order_count", "local_semantic", base, intent_map, 0.94)

    if has_e("table") and (has_m("status_active") or has_superlative or base["table_number"] is not None or "ban" in norm_clean):
        return _build_result("table_live_status", "fast_path", base, intent_map, 0.91)

    fast_map = (
        ("profit", "fast_path_profit"),
        ("cashflow", "fast_path_cashflow"),
        ("qr", "fast_path_qr"),
        ("kitchen", "fast_path_kitchen"),
        ("inventory", "fast_path_inventory"),
        ("discount", "fast_path_discounts"),
        ("void", "fast_path_voids"),
        ("audit", "fast_path_audit"),
        ("schedule", "fast_path_schedule"),
        ("payroll", "fast_path_payroll"),
        ("revenue", "fast_path_revenue"),
    )
    for ent, iid in fast_map:
        if has_e(ent):
            return _build_result(iid, "fast_path", base, intent_map, 0.91)

    if has_phrase(norm_clean, ["tong quan", "tinh hinh kinh doanh", "bao cao nhanh", "hom nay ban sao", "tinh hinh quan"]):
        return _build_result("fast_path_overview", "fast_path", base, intent_map, 0.90)

    return {
        **base,
        "matched": False,
        "intent_id": None,
        "route_hint": "gemini_fallback",
        "required_permission": None,
        "command_equivalent": None,
        "sort_by": None,
        "mode": None,
        "guard_blocked": False,
        "guard_id": None,
        "confidence": 0.0,
    }
