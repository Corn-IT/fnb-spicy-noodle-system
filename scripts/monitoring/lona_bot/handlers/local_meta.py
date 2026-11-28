"""Bot self-introduction, capability card, system architecture FAQ, and token overview."""
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

from ..ai.pool_manager import get_model_runtime_states
from ..ai.gemini_client import probe_gemini_status

def _resolve_meta_faq(
    norm_q: str,
    cfg: dict[str, str] | None = None,
    telemetry: TelemetryStore | None = None,
    cc_tags: list[str] | None = None,
    cc_honorific: str = "",
    persona_key: str = "minh_ban",
) -> dict[str, Any] | None:
    cfg_eff = cfg or get_biz_config()
    proj = html.escape(cfg_eff["project_name"])

    if any(k in norm_q for k in ("khong ton token", "ton token", "tiet kiem token")):
        return {
            "text": "\n".join([
                f"💡 <b>[{proj}] CÁC CÂU HỎI 0 TOKEN vs GEMINI AI</b>",
                "────────────────",
                "• <b>Xử lý cục bộ ⚡ 0 token (&lt;0,3s):</b>",
                "  1) Toàn bộ 20 lệnh <code>/...</code> (<code>/tongquan</code>, <code>/ban</code>, <code>/don</code>, <code>/doanhthu</code>, <code>/ket</code>, <code>/topmon</code>, <code>/token</code>, <code>/gemini</code>...)",
                "  2) Hỏi trực diện cực trị: món chạy nhất/chậm nhất, giờ cao điểm, thu ngân hủy/bán nhiều nhất",
                "  3) Đơn N phút vừa qua, đơn vừa gọi thêm món, chi tiết Bàn 01..30, tiền mặt/CK/mang về/QR, so sánh 2 kỳ",
                "  4) Tra tên món/giá/doanh số, SĐT/STK/lịch/lương nhân viên, IP đăng nhập &amp; hỏi nối tiếp về đơn/món vừa nhắc",
                "• <b>Gọi Gemini AI 🤖 (có tốn token):</b> Phân tích mở nhiều điều kiện hoặc tra cứu tài liệu phần mềm (16 phân hệ, máy in RawBT/LAN, RBAC, 10 Invariants).",
                "• Dùng <code>/token</code> để kiểm tra trạng thái Key, Model, giờ reset &amp; tỷ lệ tiết kiệm.",
            ]),
            "slots": {"intent": "meta_token"},
        }

    # Check live Gemini key/model/quota status at 0 tokens when asked naturally
    asks_quota_status = any(
        k in norm_q
        for k in (
            "kiem tra token", "token con lai", "bao nhieu token", "het quota", "quota con",
            "bao lau nua reset", "reset quota", "api key", "key con dung", "key het han",
            "trang thai gemini", "thong tin gemini", "check gemini", "check token",
            "model dang dung", "su dung token", "tieu thu token",
            "bao nhieu luot", "may luot", "may lan", "con hoi duoc",
            "model du phong", "free tier", "gioi han gemini", "rpm",
        )
    ) or ("token" in norm_q and any(k in norm_q for k in ("con lai", "da dung", "het ", "reset", "bao lau")))
    if asks_quota_status:
        store = telemetry or TelemetryStore(
            stats_path=cfg_eff.get("token_stats_file"),
            qa_log_path=cfg_eff.get("qa_log_file"),
        )
        live = probe_gemini_status(cfg_eff)
        return {
            "text": store.format_token_report(
                project_name=cfg_eff["project_name"],
                cfg=cfg_eff,
                live_probe=live,
                runtime_states=get_model_runtime_states(),
            ),
            "slots": {"intent": "meta_token_status"},
        }

    # Command list queries MUST map strictly to handle_help at 0 tokens (never let Gemini hallucinate /overview!)
    if any(
        k in norm_q
        for k in (
            "cac cau lenh", "cau lenh cua", "cac lenh cua", "danh sach lenh",
            "nhung lenh nao", "co nhung lenh", "co lenh nao", "lenh nao",
            "menu lenh", "huong dan lenh", "dung lenh gi", "cac lenh nhanh",
        )
    ):
        return {
            "text": handle_help(cfg=cfg_eff),
            "slots": {"intent": "meta_help"},
        }

    if any(k in norm_q for k in ("biet lam gi", "lam duoc gi", "giup duoc gi", "chuc nang gi", "gioi thieu ve", "gioi thieu em", "gioi thieu ban")):
        p = persona_spec(persona_key)
        self_p = p["bot"]
        hon_prefix = f"{html.escape(cc_honorific)} " if cc_honorific else ""
        if cc_tags:
            greet_tags = " ".join(
                t if t.startswith("<a ") else html.escape(t)
                for t in cc_tags
            )
            if self_p == "em":
                header_line = f"👋 <b>Dạ em chào {hon_prefix}{greet_tags}!</b> Em là <b>Lona</b> (<code>@POS_Lona_bot</code>) — trợ lý thống kê &amp; hỗ trợ vận hành POS của <b>{proj}</b> ạ:"
            else:
                header_line = f"👋 <b>Chào {hon_prefix}{greet_tags}!</b> Mình là <b>Lona</b> (<code>@POS_Lona_bot</code>) — trợ lý thống kê &amp; hỗ trợ vận hành POS của <b>{proj}</b>:"
        else:
            if self_p == "em":
                header_line = f"🤖 <b>[{proj}] TRỢ LÝ @POS_Lona_bot</b> — Dạ em là <b>Lona</b>, trợ lý POS phục vụ {html.escape(p['user'])} ạ:"
            else:
                header_line = f"🤖 <b>[{proj}] TRỢ LÝ @POS_Lona_bot</b>"
        return {
            "text": "\n".join([
                header_line,
                "────────────────",
                "• <b>Tra số liệu &amp; DB 20 bảng (0 token · &lt;0,3s):</b> Doanh thu, két tiền, đơn hàng/Bàn, món bán chạy/chậm, bếp, nhập kho, QR, khuyến mãi, nhân sự, lịch trực, lương, phiên IP &amp; audit.",
                "• <b>Giải đáp phần mềm POS:</b> Hướng dẫn 16 phân hệ, máy in 80mm/RawBT/iMin, Single-Session, 10 Hard Invariants.",
                f"• <b>Cách gọi {self_p}:</b> Gọi <code>Lona</code> / <code>Bot</code> / <code>Trợ lý</code>, tag <code>@POS_Lona_bot</code>, Reply tin nhắn của {self_p} hoặc gõ <code>/help</code> (đủ 20 lệnh nhanh).",
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
    if len(norm_q.split()) <= 6 and re.match(
        r"^(?:chao(?:\s+(?:em|lona|bot|ban|anh|chi|oi))*|hi|hello|halo|alo|lona(?:\s+(?:oi|a|ne))*|cam on(?:\s+(?:em|lona|bot|ban|nhieu|lam|qua|nhe|nha|a))*|ok(?:\s+cam\s+on)?|tuyet|tam biet|bye|thank(?:\s+you)?)(?:\s+(?:em|anh|chi|nha|nhe|a|nhieu))*$",
        norm_q,
    ):
        p = persona_spec(persona_key)
        is_thanks = any(k in norm_q for k in ("cam on", "thank", "ok", "tuyet"))
        is_bye = any(k in norm_q for k in ("tam biet", "bye"))
        prefix = "Dạ " if p["bot"] == "em" else ""
        suffix = " ạ" if p["bot"] == "em" else ""
        if is_bye:
            msg_txt = f"👋 {prefix}chào {html.escape(p['user'])}, cần xem số liệu hay hỗ trợ POS cứ gọi {p['bot']} nhé{suffix}!"
        elif is_thanks:
            msg_txt = f"😊 {prefix}không có chi! {html.escape(p['user'])} cần kiểm tra thêm số liệu POS cứ nhắn {p['bot']} nhé{suffix}."
        else:
            msg_txt = f"👋 {prefix}chào {html.escape(p['user'])}! {p['bot'].capitalize()} là Lona — {html.escape(p['user'])} cần tra doanh thu, đơn hàng, món bán chạy hay hướng dẫn POS ạ?"
        return {"text": msg_txt, "slots": {"intent": "meta_greeting"}}

    return None
