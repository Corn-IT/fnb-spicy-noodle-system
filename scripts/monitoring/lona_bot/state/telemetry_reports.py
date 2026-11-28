"""Formatted telemetry dashboards and missed-intent cluster reports."""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
from pathlib import Path
from typing import Any

from ..core.config import canonical_gemini_model, get_gemini_pool_specs
from ..core.vi_text import VN_TZ, fmt_vnd, strip_vi, vn_now

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore[misc,assignment]

LA_TZ = ZoneInfo("America/Los_Angeles") if ZoneInfo else dt.timezone(dt.timedelta(hours=-8))


def google_quota_reset_info(now_dt: dt.datetime | None = None) -> dict[str, str]:
    """
    Compute the current Google Gemini Developer API daily quota date (America/Los_Angeles)
    and exact countdown to next 00:00 Pacific reset converted into Vietnam time (+07:00).
    """
    now_vn = (now_dt or vn_now()).astimezone(VN_TZ)
    now_la = now_vn.astimezone(LA_TZ)
    next_la_date = now_la.date() + dt.timedelta(days=1)
    if isinstance(LA_TZ, dt.tzinfo):
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=LA_TZ)
    else:
        next_reset_la = dt.datetime.combine(next_la_date, dt.time(0, 0), tzinfo=dt.timezone(dt.timedelta(hours=-8)))
    next_reset_vn = next_reset_la.astimezone(VN_TZ)
    delta_sec = max(0, int((next_reset_vn - now_vn).total_seconds()))
    hours = delta_sec // 3600
    mins = (delta_sec % 3600) // 60
    day_word = "hôm nay" if next_reset_vn.date() == now_vn.date() else "ngày mai"
    return {
        "pacific_date": now_la.date().isoformat(),
        "reset_vn_str": f"{next_reset_vn.strftime('%H:%M')} {day_word} ({next_reset_vn.strftime('%d/%m')})",
        "countdown_str": f"{hours} giờ {mins:02d} phút",
    }


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def plain_snippet(text: str, limit: int = 240) -> str:
    clean = re.sub(r"<[^>]+>", " ", str(text or ""))
    clean = html.unescape(re.sub(r"\s+", " ", clean)).strip()
    return clean[:limit] if len(clean) <= limit else clean[: limit - 1] + "…"


def _empty_bucket() -> dict[str, Any]:
    return {
        "local_zero_token": 0,
        "blocked_zero_token": 0,
        "gemini_calls": 0,
        "gemini_api_requests": 0,
        "gemini_prompt_tokens": 0,
        "gemini_output_tokens": 0,
        "gemini_total_tokens": 0,
        "models": {},
    }

def _fmt_num(n: Any) -> str:
    try:
        return f"{int(n or 0):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"

class TelemetryReportMixin:
    _qa_log_path: Any
    _stats: dict[str, Any]

    def build_missed_intent_digest(self, limit: int = 8) -> list[dict[str, Any]]:
        """Cluster recent nlu_miss_candidate questions normalized for semantic grammar expansion."""
        if not self._qa_log_path or not self._qa_log_path.exists():
            return []
        buckets: dict[str, dict[str, Any]] = {}
        try:
            lines = self._qa_log_path.read_text(encoding="utf-8").splitlines()
        except Exception:
            return []
        for raw in lines[-400:]:
            if not raw.strip():
                continue
            try:
                entry = json.loads(raw)
            except Exception:
                continue
            if not entry.get("nlu_miss_candidate"):
                continue
            q = str(entry.get("q") or "").strip()
            norm = strip_vi(q)
            if not norm:
                continue
            row = buckets.setdefault(norm, {"norm": norm, "sample": q, "count": 0})
            row["count"] += 1
        return sorted(buckets.values(), key=lambda x: (-x["count"], x["norm"]))[:limit]

    def format_token_report(
        self,
        project_name: str = "Ăn Vặt Tran",
        now_dt: dt.datetime | None = None,
        cfg: dict[str, str] | None = None,
        live_probe: dict[str, Any] | None = None,
        runtime_states: dict[str, dict[str, Any]] | None = None,
    ) -> str:
        now = (now_dt or vn_now()).astimezone(VN_TZ)
        reset_info = google_quota_reset_info(now)
        day_b = self._stats["days"].get(now.date().isoformat()) or _empty_bucket()
        pac_b = self._stats["pacific_days"].get(reset_info["pacific_date"]) or _empty_bucket()
        if int(pac_b.get("gemini_calls", 0) or 0) == 0 and int(day_b.get("gemini_calls", 0) or 0) > 0 and reset_info["pacific_date"] == now.date().isoformat():
            pac_b = day_b
        mon_b = self._stats["months"].get(now.strftime("%Y-%m")) or _empty_bucket()

        def summarize(b: dict[str, Any]) -> tuple[int, int, int]:
            zero_total = int(b.get("local_zero_token", 0) or 0) + int(b.get("blocked_zero_token", 0) or 0)
            gem = int(b.get("gemini_calls", 0) or 0)
            total_reqs = zero_total + gem
            pct_zero = round(zero_total * 100 / total_reqs) if total_reqs > 0 else 100
            return zero_total, gem, pct_zero

        d_zero, d_gem, d_pct = summarize(day_b)
        m_zero, m_gem, m_pct = summarize(mon_b)

        cfg_eff = cfg or {}
        tier_name = (cfg_eff.get("gemini_tier_name") or "Free Tier").strip()
        pool_specs = get_gemini_pool_specs(cfg_eff)
        primary_spec = pool_specs[0]
        total_rpd_limit = sum(int(s["rpd"]) for s in pool_specs)
        is_multi_pool = len(pool_specs) > 1

        # Per-model used requests today (backfill unattributed calls onto primary model cleanly)
        pac_calls = int(pac_b.get("gemini_calls", 0) or 0)
        used_reqs = max(pac_calls, int(pac_b.get("gemini_api_requests") or 0))
        raw_model_map = pac_b.get("models") if isinstance(pac_b.get("models"), dict) else {}
        used_by_canon: dict[str, int] = {}
        for m_name, m_stats in raw_model_map.items():
            if isinstance(m_stats, dict):
                cm = canonical_gemini_model(str(m_name))
                used_by_canon[cm] = used_by_canon.get(cm, 0) + int(m_stats.get("api_requests") or m_stats.get("calls") or 0)
        attributed_sum = sum(used_by_canon.values())
        if used_reqs > attributed_sum:
            p_canon = canonical_gemini_model(str(primary_spec["model"]))
            used_by_canon[p_canon] = used_by_canon.get(p_canon, 0) + (used_reqs - attributed_sum)

        probe_by_model: dict[str, dict[str, Any]] = {}
        if live_probe and isinstance(live_probe.get("models"), list):
            for m_item in live_probe["models"]:
                probe_by_model[canonical_gemini_model(str(m_item.get("model") or ""))] = m_item
        rt_map = runtime_states or {}

        status_lines: list[str] = []
        if live_probe is not None and not live_probe.get("configured"):
            status_lines.append("• 🔴 <b>Chưa gắn API Key Gemini</b>")
        elif live_probe is not None and not live_probe.get("key_valid"):
            status_lines.append("• 🔴 <b>Key lỗi hoặc bị từ chối</b> — Cần kiểm tra lại trên AI Studio")
        elif not is_multi_pool:
            p_model = str(primary_spec["model"])
            p_probe = probe_by_model.get(canonical_gemini_model(p_model))
            if p_probe and not p_probe.get("ok"):
                code = p_probe.get("status_code") or "ERR"
                status_lines.append(f"• 🔴 <b>Cảnh báo (HTTP {code}):</b> {html.escape(str(p_probe.get('error', ''))[:100])}")
            else:
                status_lines.append(
                    f"• 🟢 <b>Hoạt động bình thường</b> — Sẵn sàng trả lời (<code>{html.escape(p_model)}</code>)"
                )
        else:
            def _pool_badge(spec: dict[str, Any]) -> str:
                cm = str(spec["canonical"])
                rt = rt_map.get(cm) or {}
                cd = rt.get("cooldown")
                if cd:
                    r = cd.get("reason")
                    if r == "daily_quota":
                        return "🔴 Hết lượt ngày"
                    if r == "rpm_limit":
                        return f"⏳ Nghỉ {cd.get('remaining_sec', 60)}s"
                    return "🟠 Tạm nghỉ"
                pr = probe_by_model.get(cm)
                if pr and not pr.get("ok"):
                    return f"🟡 HTTP {pr.get('status_code') or 'ERR'}"
                return "🟢 Sẵn sàng"

            # Headline summary + Tier 1 primary + peer fast models + Tier 2 Flash backup
            p_badge = _pool_badge(primary_spec)
            if p_badge.startswith("🟢"):
                status_lines.append(f"• 🟢 <b>Hoạt động bình thường</b> — Tự cân bằng tải {len(pool_specs)} model miễn phí")
            else:
                any_ready = any(_pool_badge(s).startswith("🟢") for s in pool_specs[1:])
                if any_ready:
                    status_lines.append("• 🟠 <b>Model chính tạm bận</b> — Đã tự chuyển sang model dự phòng")
                else:
                    status_lines.append("• 🔴 <b>Cảnh báo:</b> Toàn bộ model AI đang tạm nghỉ/quá tải")
            fast_specs = [s for s in pool_specs if s["tier"] in ("primary", "peer")]
            backup_specs = [s for s in pool_specs if s["tier"] not in ("primary", "peer")]
            for s in fast_specs:
                u = used_by_canon.get(str(s["canonical"]), 0)
                badge = _pool_badge(s)
                note = "tự chia tải" if s["tier"] == "peer" else "mặc định"
                status_lines.append(
                    f"• {badge} · <code>{html.escape(str(s['model']))}</code>: <b>{_fmt_num(u)}/{_fmt_num(s['rpd'])}</b> ({s['rpm']}/phút · {note})"
                )
            if backup_specs:
                bk_used = sum(used_by_canon.get(str(s["canonical"]), 0) for s in backup_specs)
                bk_total = sum(int(s["rpd"]) for s in backup_specs)
                bk_ok = sum(1 for s in backup_specs if _pool_badge(s).startswith("🟢"))
                bk_icon = "🟢" if bk_ok == len(backup_specs) else ("🟡" if bk_ok > 0 else "🔴")
                bk_names = ", ".join(
                    "3-Flash" if s["short"] == "3 Flash" else str(s["short"]).removesuffix(" Flash")
                    for s in backup_specs
                )
                status_lines.append(
                    f"• {bk_icon} Dự phòng tầng 2 ({html.escape(bk_names)}): <b>{_fmt_num(bk_used)}/{_fmt_num(bk_total)} lượt</b> ({bk_ok}/{len(backup_specs)} mở API)"
                )

        rem_reqs = max(0, total_rpd_limit - used_reqs)
        pac_tok = int(pac_b.get("gemini_total_tokens", 0) or 0)
        est_low = max(0, rem_reqs // 3)
        est_high = max(0, rem_reqs // 2)

        fast_tier_specs = [s for s in pool_specs if s["tier"] in ("primary", "peer")] or [primary_spec]
        eff_rpm = sum(int(s["rpm"]) for s in fast_tier_specs)
        eff_tpm = sum(int(s["tpm"]) for s in fast_tier_specs)
        eff_tpm_lbl = f"{eff_tpm // 1000}K" if eff_tpm >= 1000 else str(eff_tpm)

        pool_hdr = f"{_fmt_num(total_rpd_limit)} lượt API/ngày từ {len(pool_specs)} model" if is_multi_pool else f"{_fmt_num(total_rpd_limit)} lượt API/ngày"
        lines = [
            f"🤖 <b>[{html.escape(project_name)}] TÌNH TRẠNG AI &amp; HẠN MỨC HÔM NAY</b>",
            f"🗓 {now.strftime('%H:%M · %d/%m/%Y')} · Gói: <b>{html.escape(tier_name)} ({pool_hdr})</b>",
            "────────────────",
            "<b>1. Trạng thái hiện tại</b>",
            *status_lines,
        ]

        last_err = self._stats.get("last_gemini_error")
        if last_err:
            lines.append(
                f"• ⚠️ Sự cố gần nhất ({html.escape(str(last_err.get('at', '')))}): "
                f"HTTP {last_err.get('code', 0)} — <i>{html.escape(str(last_err.get('message', ''))[:95])}</i>"
            )

        lines.extend([
            "",
            "<b>2. Còn hỏi Gemini được bao nhiêu hôm nay?</b>",
            f"• Đã dùng hôm nay: <b>{_fmt_num(used_reqs)} / {_fmt_num(total_rpd_limit)} lượt gọi API</b> ({_fmt_num(pac_tok)} token)",
            f"• <b>Còn lại: ~{_fmt_num(rem_reqs)} / {_fmt_num(total_rpd_limit)} lượt API</b> (hỏi thêm được khoảng <b>~{est_low}–{est_high} câu AI</b>)",
        ])

        tok_budget_raw = str(cfg_eff.get("gemini_daily_token_budget") or "")
        if tok_budget_raw.isdigit() and int(tok_budget_raw) > 0:
            bud = int(tok_budget_raw)
            rem_tok = max(0, bud - pac_tok)
            lines.append(f"• Ngân sách Token ngày đặt riêng: còn <b>{_fmt_num(rem_tok)} / {_fmt_num(bud)} token</b>")

        rpm_note = (
            f"tự chia tải giữa {len(fast_tier_specs)} model để tránh báo vàng 429"
            if len(fast_tier_specs) >= 2
            else "nếu vượt chỉ cần đợi 60 giây"
        )
        lines.extend([
            "• 💡 <i>Mọi câu xử lý ⚡ 0-token (lệnh, số liệu, món bán chạy...) thì hỏi thoải mái, <b>không giới hạn số lần</b>.</i>",
            f"• ⏳ Tự reset về 0 sau: <b>{reset_info['countdown_str']}</b> (vào <b>{reset_info['reset_vn_str']}</b>)",
            f"• ⚡ Tốc độ tối đa theo phút: <b>{_fmt_num(eff_rpm)} lượt/phút</b> · <b>{eff_tpm_lbl} token/phút</b> ({rpm_note})",
            "",
            "<b>3. Hiệu quả tiết kiệm token của Bot</b>",
            f"• Hôm nay: <b>{d_zero} câu miễn phí 0-token</b> · <b>{d_gem} câu Gemini</b> → <b>Tiết kiệm {d_pct}%</b>",
            f"• Tháng {now.strftime('%m/%Y')}: <b>{m_zero} câu miễn phí</b> · <b>{m_gem} câu Gemini</b> ({_fmt_num(mon_b.get('gemini_total_tokens', 0))} token) → <b>Tiết kiệm {m_pct}%</b>",
        ])

        recent = self._stats.get("recent_gemini") or []
        if recent:
            lines.extend(["", "<b>Các câu gần đây có gọi Gemini (3 mới nhất):</b>"])
            for item in reversed(recent[-3:]):
                m_tag = str(item.get("model") or "").replace("gemini-", "").replace("-flash-lite", "").replace("-preview", "")
                m_badge = f" · {html.escape(m_tag)}" if m_tag else ""
                lines.append(
                    f"• [{html.escape(str(item.get('at', '')))}] <i>{html.escape(str(item.get('q', '')))}</i> ({_fmt_num(item.get('tokens', 0))} tok{m_badge})"
                )

        lines.append(
            f"\n<i>* Số còn lại ước tính từ lượt Bot gọi trên gói {html.escape(tier_name)} ({_fmt_num(total_rpd_limit)} lượt/ngày); "
            "nếu dùng chung Key ở nơi khác xem chính xác tại</i> <code>aistudio.google.com/rate-limit</code>."
        )
        return "\n".join(lines)
