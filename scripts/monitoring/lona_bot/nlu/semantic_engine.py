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
    if has_phrase(norm_text, ["don vua roi", "don cuoi cung", "don sau cung"]):
        return 1, True
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


def extract_order_status_filter(raw_or_norm: str) -> str | None:
    norm_text = strip_vi(raw_or_norm)
    if has_phrase(norm_text, ["chua thanh toan", "chua tra tien", "con no", "chua xong"]):
        return "UNPAID"
    if has_phrase(norm_text, ["cho xac nhan", "cho duyet", "don moi gui"]):
        return "PENDING"
    if has_phrase(norm_text, ["da thanh toan", "da tra tien"]):
        return "PAID"
    if has_phrase(norm_text, ["dang phuc vu"]) and not has_phrase(norm_text, ["ban dang phuc vu", "bao nhieu ban"]):
        return "SERVING"
    return None


def _detect_entities(raw_lower: str, norm_text: str, spec: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for entity_key, rule in (spec.get("entities") or {}).items():
        if not has_phrase(norm_text, rule.get("keywords") or ()):
            continue
        disamb = rule.get("accentDisambiguation") or {}
        if any(bad in raw_lower for bad in disamb.get("requireNoneRaw") or ()):
            continue
        if entity_key == "hour" and has_phrase(
            norm_text,
            ["mo cua", "dong cua", "gio mo cua", "gio dong cua", "tu may gio", "mo tu may gio", "dong cua may gio", "gio tam", "luu tam", "gio hang"],
        ):
            continue
        if (
            entity_key == "schedule"
            and has_phrase(norm_text, ["chot ca", "ket ca", "dau ca", "ket tien"])
            and not has_phrase(norm_text, ["ai lam", "ai truc", "co ai", "lich truc", "lich lam", "di lam", "ca sang", "ca chieu", "ca toi", "ca dem"])
        ):
            continue
        if (
            entity_key == "payroll"
            and has_phrase(norm_text, ["so luong"])
            and "lương" not in raw_lower
            and not has_phrase(norm_text, ["bang luong", "quy luong", "tien luong", "chi phi luong", "tinh luong"])
        ):
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
    order_status_filter = extract_order_status_filter(norm_clean)

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
        "order_status_filter": order_status_filter,
        "order_code": order_m.group(1).upper() if order_m else None,
        "table_number": int(table_m.group(1)) if table_m else None,
    }

    has_e = set(entities).__contains__
    has_m = set(metrics).__contains__
    is_analytics_override = has_phrase(
        norm_clean,
        [
            "phan tich chi tiet", "phan tich sau", "xu huong", "du bao", "du doan", "nhan dinh",
            "chien luoc", "de xuat", "goi y cai thien", "tu van giup",
            "lam sao de ban", "lam sao de tang", "lam sao de dong", "lam sao de giam",
            "cach tang", "cach cai thien", "tang doanh thu", "tang khach", "thu hut khach",
            "ban chay hon", "giam that thoat", "han che huy",
        ],
    )
    is_troubleshooting = has_phrase(
        norm_clean,
        ["khong duoc", "bi loi", "khac phuc", "sua loi", "khong quet duoc", "khong ket noi", "khong in duoc", "khong hoat dong"],
    ) and has_phrase(norm_clean, ["qr", "may in", "rawbt", "wifi", "gps", "pos", "bep", "in"])
    has_numerical_cue = (
        has_e("revenue")
        or has_m("popularity_high")
        or has_m("popularity_low")
        or has_m("density_high")
        or has_m("density_low")
        or has_phrase(
            norm_clean,
            ["hom qua", "tuan nay", "thang nay", "7 ngay", "30 ngay", "bao nhieu don", "co may don", "bao nhieu ban", "co may ban", "bao nhieu tien", "ban duoc", "da ban", "hom nay co may"],
        )
    )
    is_system_why = (
        has_phrase(norm_clean, ["tai sao", "vi sao"])
        and has_phrase(
            norm_clean,
            ["tam tinh", "chuyen khoan", "ket tien", "mang ve", "tach bep", "combo", "dang xuat", "bi da", "bi vang", "401", "403", "blind mode", "single session"],
        )
        and not has_numerical_cue
    )

    if not is_analytics_override and (
        is_troubleshooting
        or (has_phrase(norm_clean, spec.get("systemDocCues") or ()) and not has_numerical_cue)
        or is_system_why
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

    if has_phrase(norm_clean, ["ai dang dang nhap", "dang dang nhap", "phien dang nhap", "thiet bi nao dang", "ai dang online", "ip dang nhap"]):
        return _build_result("active_sessions", "fast_path", base, intent_map, 0.93)

    if has_phrase(
        norm_clean,
        [
            "danh sach nhan vien", "co bao nhieu nhan vien", "co may nhan vien",
            "so luong nhan vien", "so luong nhan su", "nhan su hien tai", "nhan vien hien tai",
            "bao nhieu nhan su", "co may nhan su", "tong so nhan vien", "tong nhan su",
            "nhan su gom", "ai la nhan vien",
        ],
    ):
        return _build_result("staff_list", "fast_path", base, intent_map, 0.93)

    if has_e("audit") and not has_phrase(norm_clean, ["huy don", "huy hoa don"]):
        return _build_result("fast_path_audit", "fast_path", base, intent_map, 0.92)

    if has_e("schedule") and not has_e("cashflow") and not has_e("order"):
        return _build_result("fast_path_schedule", "fast_path", base, intent_map, 0.92)

    if base["order_code"]:
        return _build_result("order_detail", "local_semantic", base, intent_map, 0.95)

    if base["table_number"] is not None and not has_e("void") and not (has_e("order") and has_m("revenue_high") and has_superlative):
        return _build_result("table_live_status", "fast_path", base, intent_map, 0.92)

    is_cashflow_kw = has_phrase(norm_clean, ["ket", "ket tien", "chot ca", "ket ca", "dau ca", "kiem ket", "chenh lech ket", "trong ket"])
    has_qr_order_slice = (not is_troubleshooting) and has_phrase(norm_clean, ["don qr", "don khach quet qr", "khach quet qr", "khach tu dat", "dat qua qr"])
    is_payment_slice = has_qr_order_slice or (
        not has_phrase(norm_clean, ["han muc", "tai khoan ngan hang", "tai khoan nhan"])
        and not is_troubleshooting
        and not has_m("recent_list")
        and (
            has_phrase(norm_clean, ["chuyen khoan", "phuong thuc thanh toan", "tien mat hay chuyen khoan", "thu tien mat", "doanh thu tien mat"])
            or (
                not is_cashflow_kw
                and has_phrase(norm_clean, ["tien mat", "thu mat"])
                and has_phrase(norm_clean, ["doanh thu", "thu", "thanh toan", "bao nhieu", "vs"])
            )
        )
    )
    if is_payment_slice:
        return _build_result("payment_breakdown", "local_semantic", base, intent_map, 0.93)

    has_explicit_menu_cue = has_phrase(
        norm_clean,
        [
            "thuc don", "menu", "bang gia", "danh muc mon", "bao nhieu danh muc", "co may danh muc",
            "nhom mon", "co nhung nhom", "tam het", "het mon", "tam ngung",
            "gia bao nhieu", "bao nhieu tien", "gia mon", "con ban khong",
            "mon dat nhat", "mon re nhat", "bao nhieu mon", "co may mon",
            "tong so mon", "ban duoc may", "ban duoc bao nhieu phan",
            "bao nhieu phan", "may phan", "may ly", "may to", "quan co ban",
        ],
    )
    has_product_avail_lookup = (
        not has_phrase(norm_clean, ["het bao nhieu", "het may tien", "het quota", "het luot", "het han muc"])
        and ("bàn" not in raw_lower)
        and (
            has_phrase(norm_clean, ["co ban ", "con ban "])
            or bool(re.search(r"\bhet\s+[a-z0-9\s]{2,28}\s+(?:roi|chua|khong)\b", norm_clean))
            or bool(re.search(r"\bcon\s+(?!ban\s+nao\b|bao\s+nhieu\s+ban\b|khach\b)[a-z0-9\s]{2,28}\s+khong\b", norm_clean))
        )
    )
    has_generic_menu_list = (
        not has_m("popularity_high")
        and not has_m("popularity_low")
        and not has_e("order")
        and has_phrase(norm_clean, ["danh sach mon", "cac mon an", "nhung mon an", "ban nhung mon gi", "co nhung mon gi", "co mon gi", "co mon nao"])
    )
    if (
        (has_explicit_menu_cue or has_generic_menu_list or has_product_avail_lookup)
        and not has_phrase(norm_clean, ["mon do", "mon nay", "don do", "don nay"])
        and not has_e("order")
        and not has_e("table")
        and not has_e("cashflow")
        and not has_e("payroll")
        and not has_e("schedule")
        and not has_e("inventory")
        and not has_e("qr")
    ):
        return _build_result("menu_catalog", "local_semantic", base, intent_map, 0.92)

    has_customer_cnt_cue = (
        not has_e("hour")
        and not has_e("table")
        and has_phrase(norm_clean, ["bao nhieu khach", "may khach", "bao nhieu luot khach", "co may khach"])
    )

    if (
        not has_e("void")
        and not has_e("staff")
        and not has_e("revenue")
        and not has_e("profit")
        and not has_e("qr")
        and (
            has_e("order")
            or order_status_filter is not None
            or has_customer_cnt_cue
            or (order_type_filter is not None and (has_m("recent_list") or has_m("count_query")))
        )
    ):
        if has_m("revenue_high") and has_superlative:
            return _build_result("order_top_value", "local_semantic", base, intent_map, 0.93)
        if has_m("count_query") or has_customer_cnt_cue:
            return _build_result("order_count", "local_semantic", base, intent_map, 0.94)
        if (
            has_m("recent_list")
            or order_status_filter is not None
            or has_phrase(norm_clean, ["cac don", "nhung don", "don nao", "liet ke don", "danh sach don", "xem don", "don vua roi", "don cuoi cung", "don ca dem"])
        ):
            return _build_result("recent_orders", "local_semantic", base, intent_map, 0.94)

    if base["table_number"] is not None or (has_e("table") and (has_m("status_active") or has_superlative or "ban" in norm_clean)):
        return _build_result("table_live_status", "fast_path", base, intent_map, 0.91)

    fast_map = (
        ("profit", "fast_path_profit"),
        ("cashflow", "fast_path_cashflow"),
        ("qr", "fast_path_qr"),
        ("inventory", "fast_path_inventory"),
        ("discount", "fast_path_discounts"),
        ("void", "fast_path_voids"),
        ("audit", "fast_path_audit"),
        ("schedule", "fast_path_schedule"),
        ("payroll", "fast_path_payroll"),
        ("revenue", "fast_path_revenue"),
    )
    if has_e("kitchen") and not has_e("staff"):
        return _build_result("fast_path_kitchen", "fast_path", base, intent_map, 0.91)
    for ent, iid in fast_map:
        if ent == "schedule" and (has_e("cashflow") or has_e("order")):
            continue
        if has_e(ent):
            return _build_result(iid, "fast_path", base, intent_map, 0.91)

    if has_phrase(
        norm_clean,
        [
            "tong quan", "tinh hinh kinh doanh", "bao cao nhanh", "hom nay ban sao", "tinh hinh quan",
            "tinh hinh hom nay", "tinh hinh ban hang", "ban hang hom nay", "tong ket hom nay",
            "bua nay dong khach khong", "hom nay dong khach khong", "ban duoc gi",
        ],
    ) or (
        has_phrase(norm_clean, ["hom nay", "bua nay", "hom qua", "tuan nay", "thang nay"])
        and has_phrase(norm_clean, ["the nao", "ra sao", "on khong", "ban sao", "sao roi"])
        and not has_e("product")
        and not has_e("hour")
        and not has_e("staff")
        and not has_e("table")
        and not has_e("order")
    ):
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
