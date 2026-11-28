#!/usr/bin/env python3
"""
Local Zero-Cost System Knowledge Base & Doc Searcher (RAG) for @POS_Lona_bot.
Indexes core POS architecture, 16-module user guide, 10 Hard Invariants, and RBAC/MDM docs
so Gemini answers software & operational questions accurately without bloating every prompt.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from biz_bot_common import strip_vi

DOC_RELATIVE_PATHS = (
    "docs/HUONG_DAN_SU_DUNG_VA_GIAI_PHAP.md",
    "docs/bmad/02-RBAC-And-MDM-Matrix.md",
    "docs/bmad/03-Edge-Cases-And-Invariants.md",
    "AGENTS.md",
)

STOP_WORDS_VI = {
    "la", "gi", "the", "nao", "nhu", "cach", "lam", "sao", "cho", "toi", "minh", "ban",
    "hoi", "ve", "cua", "trong", "he", "thong", "pos", "duoc", "khong", "khi", "co", "va",
    "bi", "nhung", "cac", "mot", "voi", "tai", "sao", "de", "can", "muon", "thi", "roi",
    "nay", "kia", "do", "day", "oi", "a", "nhe", "nha",
}

SYNONYM_EXPANSIONS = {
    "may in": ("in", "nhiet", "rawbt", "esc/pos", "itp6", "imin", "80mm", "9100"),
    "rawbt": ("in", "usb", "android", "imin", "itp6", "rj11"),
    "dang nhap": ("single-session", "active_session_id", "phien", "401", "bi da", "dang xuat"),
    "vang": ("single-session", "session:revoked", "401", "dang nhap"),
    "ket ca": ("cashflow", "blind mode", "expected_cash", "opening_budget", "cash_drawer", "bu chenh lech"),
    "doi mon": ("substitution", "allow_substitution", "auto", "thay the"),
    "tach bep": ("split-kitchen", "delta split", "combo", "kitchen_status", "new", "printed"),
    "vietqr": ("payment-qr", "xoay vong", "han muc", "tam tinh", "provisional"),
    "quyen": ("rbac", "superadmin", "401", "403", "permissions"),
    "ban": ("move", "merge", "swap", "to_takeaway", "dining_tables", "gio tam", "draft"),
    "gio tam": ("pos_drafts", "luu tam", "deleteDrafts", "chua gan ban"),
    "luong": ("payroll", "full_time", "part_time", "work_schedules", "bang cong"),
    "push": ("web push", "vapid", "push_subscriptions", "chuong", "giong noi"),
}

SYSTEM_MAP_SUMMARY = """
PHẦN MỀM POS ĂN VẶT TRAN (16 phân hệ UI · chi tiết hướng dẫn/máy in/RBAC/10 Invariants gọi tool search_system_docs):
- 16 phân hệ: POS Desktop (/pos), POS Touch (/pos/touch/*), QR Khách (/q/:token, khóa Wi-Fi IP/GPS), Thực đơn (/menu: Bếp->Danh mục->Món, Size M/L, Cấp cay 0-7, Auto-Check, Đổi món), Dashboard (/dashboard), Hóa đơn (/invoices), Nhập kho (/inventory), Kết ca (/cashflow: Blind Mode), VietQR xoay vòng (/payment-qr), Khuyến mãi (/discounts), Nhân sự (/employees), Lịch tuần (/schedules), Bảng lương (/payroll), Master Data (/master-data), RBAC (/rbac: 14 nhóm quyền, Single-Session 401), Cài đặt 80mm/RawBT/LAN :9100 (/settings), Hồ sơ (/profile).
- ĐÚNG 19 lệnh gạch chéo @POS_Lona_bot (KHÔNG tự bịa lệnh ngoài danh sách): /tongquan, /ban, /don, /doanhthu, /ket, /qr, /topmon, /bep, /kho, /khuyenmai, /huy, /audit, /lich, /luong, /loinhuan, /token, /gemini, /hoi, /quen, /help.

POSTGRESQL fnb_pos (UTC+7 · 20 BẢNG/VIEW CHỦ QUÁN):
- orders(id, order_code, order_type['DINE_IN'|'TAKEAWAY'], order_source['POS_COUNTER'|'QR_CODE'], table_id, takeaway_number, status['PENDING'|'SERVING'|'PAID'|'VOIDED'], payment_method['CASH'|'TRANSFER'|'SPLIT'], payment_account_id, cash_amount, transfer_amount, subtotal_amount, discount_amount, discount_id, total_amount, merged_into_order_id, table_transfer_logs, cashier_id, note, void_reason, pending_payment_edit, created_at, paid_at)
- order_items(id, order_id, product_id, quantity, unit_price, modifiers_snapshot, item_note, batch_no, item_source, kitchen_status['NEW'|'PRINTED'|'CANCELLED'], is_takeaway, created_at)
- dining_tables(id, name, qr_token, status['AVAILABLE'|'PENDING'|'OCCUPIED'], active_order_id)
- pos_drafts(id, order_type, table_id, items, note, created_by, submitted_order_id, submitted_at, updated_at) | takeaway_sequences(business_date, last_number)
- products(id, name, category_id, price, station['BEP_NAU'|'BEP_CHIEN'|'PHA_CHE'|'COMBO'|'BEP_*'], is_available, sort_order) | combo_items(parent_product_id, child_product_id, quantity)
- modifier_groups(id, product_id, name, is_required, max_select, is_auto_select, allow_substitution) | modifiers(id, group_id, name, extra_price, is_default_checked, is_available, default_substitute_name, allowed_substitute_names)
- discounts(id, code, name, value_type['PERCENT'|'FIXED'], value, max_discount_amount, scope['ORDER'|'CATEGORY'|'PRODUCT'], min_order_amount, starts_at, ends_at, active_weekdays, time_window_start, time_window_end, usage_limit, used_count, is_active, is_archived) | discount_targets(id, discount_id, category_id, product_id)
- payment_accounts(id, label, bank_code, account_no, account_name, priority, is_active, daily_limit, monthly_limit, yearly_limit)
- inventory_imports(id, ingredient_mdm_id, supplier_mdm_id, supplier_name_snapshot, item_name_snapshot, unit_name, unit_price, quantity, total_cost, payment_source['CASH_DRAWER'|'EXTERNAL'], import_date, note, created_by, is_deleted)
- cash_drawer_settlements(id, settlement_date, shift_name, opening_budget, total_cash_sales, total_transfer_sales, total_cash_imports, expected_cash_in_drawer, actual_counted_cash, discrepancy_amount, status['MATCHED'|'SURPLUS'|'SHORTAGE'], denominations_detail, note, closed_by)
- work_schedules(id, week_start_date, day_of_week[0=T2..6=CN], time_slot, employee_ids)
- employees(id, full_name, short_name, phone, citizen_id, position_id, specialty_id, start_date, bank_name, bank_account_no, bank_account_name, note, is_deleted)
- users(id, employee_id, username, is_super_admin, role_label, permissions, is_active, active_session_ip, active_session_device, active_session_agent, active_session_at)
- v_bot_master_data(id, category, name, normalized_name, metadata, is_active) -- dùng thay master_data gốc (chỉ trừ web_push_vapid_keys)
- push_subscriptions(id, user_id, session_id, endpoint, user_agent, device_label, last_notified_at) | audit_logs(id, module, action, actor_id, actor_full_name, actor_username, summary, ip_address, device_label, metadata, created_at)
BÍ MẬT BỊ KHÓA TUYỆT ĐỐI: users.password_hash, master_data gốc, push_subscriptions.p256dh/auth.
""".strip()

_DOC_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _split_long_block(source: str, heading: str, body: str, max_len: int = 1250) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    if len(body) <= max_len:
        chunks.append({
            "source": source,
            "heading": heading,
            "content": body,
            "norm_heading": strip_vi(heading),
            "norm_content": strip_vi(body),
        })
        return chunks

    lines = body.splitlines()
    buf: list[str] = []
    cur_len = 0
    part_idx = 1
    for line in lines:
        add_len = len(line) + 1
        if cur_len + add_len > max_len and buf:
            text_part = "\n".join(buf).strip()
            h_part = f"{heading} (phần {part_idx})"
            chunks.append({
                "source": source,
                "heading": h_part,
                "content": text_part,
                "norm_heading": strip_vi(heading),
                "norm_content": strip_vi(text_part),
            })
            buf = [line]
            cur_len = add_len
            part_idx += 1
        else:
            buf.append(line)
            cur_len += add_len
    if buf:
        text_part = "\n".join(buf).strip()
        h_part = f"{heading} (phần {part_idx})" if part_idx > 1 else heading
        chunks.append({
            "source": source,
            "heading": h_part,
            "content": text_part,
            "norm_heading": strip_vi(heading),
            "norm_content": strip_vi(text_part),
        })
    return chunks


def _parse_markdown_chunks(path: Path, rel_name: str) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8")
    stack: list[tuple[int, str]] = []
    current_body: list[str] = []
    chunks: list[dict[str, Any]] = []

    def flush() -> None:
        body_text = "\n".join(current_body).strip()
        if len(body_text) < 25:
            return
        heading_path = " > ".join(h for _, h in stack) or rel_name
        chunks.extend(_split_long_block(rel_name, heading_path, body_text))

    heading_re = re.compile(r"^(#{1,4})\s+(.+?)\s*$")
    for line in raw.splitlines():
        m = heading_re.match(line)
        if m:
            flush()
            current_body = []
            level = len(m.group(1))
            title = m.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
        else:
            current_body.append(line)
    flush()
    return chunks


def load_doc_chunks(project_dir: str | None = None) -> list[dict[str, Any]]:
    root = Path(project_dir or Path(__file__).resolve().parents[2])
    key = str(root)
    mtime_sum = 0.0
    existing_files: list[tuple[Path, str]] = []
    for rel in DOC_RELATIVE_PATHS:
        p = root / rel
        if p.exists():
            mtime_sum += p.stat().st_mtime
            existing_files.append((p, rel))

    cached = _DOC_CACHE.get(key)
    if cached and cached[0] == mtime_sum:
        return cached[1]

    all_chunks: list[dict[str, Any]] = []
    for p, rel in existing_files:
        all_chunks.extend(_parse_markdown_chunks(p, rel))
    _DOC_CACHE[key] = (mtime_sum, all_chunks)
    return all_chunks


def search_system_docs(
    query: str,
    topic: str | None = None,
    project_dir: str | None = None,
    max_chunks: int = 3,
    max_total_chars: int = 3200,
) -> list[dict[str, str]]:
    chunks = load_doc_chunks(project_dir=project_dir)
    if not chunks:
        return []

    norm_q = strip_vi(query or "")
    norm_topic = strip_vi(topic or "")
    raw_tokens = re.findall(r"[a-z0-9_:/-]+", norm_q)
    tokens: list[str] = [t for t in raw_tokens if len(t) >= 2 and t not in STOP_WORDS_VI]

    # Expand domain aliases gently
    extra_tokens: list[str] = []
    for key_phrase, aliases in SYNONYM_EXPANSIONS.items():
        if key_phrase in norm_q or (norm_topic and key_phrase in norm_topic):
            extra_tokens.extend(aliases)
    if norm_topic:
        extra_tokens.extend(re.findall(r"[a-z0-9_:/-]+", norm_topic))

    search_terms = list(dict.fromkeys(tokens + extra_tokens))
    if not search_terms:
        search_terms = [t for t in raw_tokens if t]

    scored: list[tuple[float, dict[str, Any]]] = []
    for ch in chunks:
        nh = ch["norm_heading"]
        nc = ch["norm_content"]
        score = 0.0
        for term in search_terms:
            if term in nh:
                score += 4.5
            cnt = nc.count(term)
            if cnt > 0:
                score += min(4.0, 1.0 + 0.5 * cnt)
        if norm_q and len(norm_q) >= 6 and norm_q in nc:
            score += 6.0
        if norm_topic and norm_topic in nh:
            score += 3.0
        if score > 0:
            scored.append((score, ch))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    selected: list[dict[str, str]] = []
    total_len = 0
    for _, ch in scored[: max(1, max_chunks)]:
        snippet = ch["content"]
        remaining = max_total_chars - total_len
        if remaining <= 200:
            break
        if len(snippet) > remaining:
            snippet = snippet[: remaining - 1] + "…"
        selected.append({
            "source": ch["source"],
            "heading": ch["heading"],
            "content": snippet,
        })
        total_len += len(snippet)

    return selected
