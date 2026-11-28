#!/usr/bin/env python3
"""
Interactive Telegram admin command bot for Ăn Vặt Tran POS VPS.
Runs via systemd (long-polling) with strict Chat ID allowlisting, fixed command whitelist,
log redaction, rate limiting, and 2-step confirmation for API restarts.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def load_monitor_env(env_path: str) -> dict[str, str]:
    merged = dict(os.environ)
    path = Path(env_path)
    if path.exists():
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                merged[key] = value
    return merged


ENV = load_monitor_env(os.environ.get("MONITOR_ENV_FILE", "/etc/fnb-monitor.env"))
BOT_TOKEN = ENV.get("FNB_TELEGRAM_BOT_TOKEN", "").strip()
ALLOWED_CHAT_ID = ENV.get("FNB_TELEGRAM_CHAT_ID", "").strip()
PROJECT_NAME = ENV.get("FNB_ALERT_PROJECT_NAME", "Ăn Vặt Tran").strip() or "Ăn Vặt Tran"
DOMAIN = ENV.get("FNB_DOMAIN", "pos.anvattran.com").strip() or "pos.anvattran.com"
PROJECT_DIR = ENV.get("FNB_PROJECT_DIR", "/opt/fnb-pos").strip() or "/opt/fnb-pos"
SCRIPT_DIR = Path(__file__).resolve().parent

MIN_COMMAND_INTERVAL_SEC = 1.5
RESTART_CONFIRM_TTL_SEC = 60
RESTART_COOLDOWN_SEC = 180

VN_TZ = dt.timezone(dt.timedelta(hours=7))

SECRET_PATTERNS = [
    re.compile(r"((?:token|qrToken|refreshToken|accessToken|password|secret|authorization|cookie)=)([^&\s'\"]+)", re.I),
    re.compile(r"(Bearer\s+)[A-Za-z0-9._-]+", re.I),
]


def redact_sensitive(text: str) -> str:
    cleaned = text
    for pattern in SECRET_PATTERNS:
        cleaned = pattern.sub(r"\1[REDACTED]", cleaned)
    return cleaned


def vn_now_str() -> str:
    return dt.datetime.now(VN_TZ).strftime("%H:%M:%S · %d/%m/%Y")


def parse_command(raw_text: str) -> tuple[str, list[str]] | None:
    text = raw_text.strip()
    if not text.startswith("/"):
        return None
    parts = text.split()
    cmd_head = parts[0].lower()
    if "@" in cmd_head:
        cmd_head = cmd_head.split("@", 1)[0]
    return cmd_head, parts[1:]


def run_cmd(args: list[str], cwd: str | None = None, timeout: int = 15) -> tuple[int, str]:
    proc = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    combined = (proc.stdout or "") + (("\n" + proc.stderr) if proc.stderr else "")
    return proc.returncode, combined.strip()


def tg_api(method: str, payload: dict[str, Any] | None = None, timeout: int = 35) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def reply_tg(chat_id: str, text: str, reply_to_message_id: int | None = None) -> None:
    if len(text) > 3950:
        text = text[:3940] + "\n…"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_to_message_id is not None:
        payload["reply_to_message_id"] = reply_to_message_id
    try:
        tg_api("sendMessage", payload, timeout=10)
    except urllib.error.HTTPError as err:
        if err.code == 400:
            plain_payload = {
                "chat_id": chat_id,
                "text": re.sub(r"</?(?:b|code|pre|i)>", "", text),
                "disable_web_page_preview": True,
            }
            if reply_to_message_id is not None:
                plain_payload["reply_to_message_id"] = reply_to_message_id
            tg_api("sendMessage", plain_payload, timeout=10)
        else:
            raise


def register_bot_commands() -> None:
    commands = [
        {"command": "status", "description": "Tổng quan VPS, Docker & lưu lượng API 1h"},
        {"command": "health", "description": "Kiểm tra nhanh HTTPS, DB & dịch vụ"},
        {"command": "vps", "description": "Chi tiết CPU, RAM, Disk & Top tiến trình"},
        {"command": "logs", "description": "15 dòng log gần nhất (api|caddy|postgres)"},
        {"command": "errors", "description": "Lọc lỗi 5xx / ERROR gần đây & bộ đếm 1h"},
        {"command": "prune", "description": "Dọn Docker build cache thừa ngay"},
        {"command": "backup", "description": "Sao lưu nóng Database ngay lập tức"},
        {"command": "restart_api", "description": "Khởi động lại API (xác nhận 2 bước)"},
        {"command": "help", "description": "Xem bảng hướng dẫn 9 lệnh hạ tầng"},
    ]
    for scope in ({"type": "default"}, {"type": "all_group_chats"}):
        try:
            tg_api("setMyCommands", {"commands": commands, "scope": scope}, timeout=10)
        except Exception as err:
            print(f"[telegram-bot] setMyCommands ({scope['type']}) warning: {err}", file=sys.stderr)


def handle_status() -> str:
    rc, out = run_cmd(
        [str(SCRIPT_DIR / "hourly-report.sh"), "--force", "--no-reset", "--on-demand", "--stdout"],
        cwd=PROJECT_DIR,
        timeout=20,
    )
    if rc == 0 and out.strip():
        return out
    return f"🔴 Không lấy được trạng thái hệ thống (rc={rc}): <code>{html.escape(out[:300])}</code>"


def handle_health() -> str:
    t0 = time.monotonic()
    health_line = "🔴 Lỗi kết nối"
    try:
        req = urllib.request.Request(
            f"https://{DOMAIN}/api/v1/health",
            headers={"User-Agent": "AnVatTran-CommandBot/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            ms = int((time.monotonic() - t0) * 1000)
            body = json.loads(r.read().decode("utf-8"))
            if r.status == 200 and body.get("status") == "ok" and body.get("database") == "connected":
                health_line = f"🟢 <b>Ổn định</b> (HTTPS 200 · {ms}ms · DB OK)"
            else:
                health_line = f"🟡 <b>Cảnh báo</b> (HTTP {r.status} · DB={html.escape(str(body.get('database')))})"
    except Exception as err:
        health_line = f"🔴 <b>Lỗi</b> ({html.escape(str(err)[:120])})"

    containers = []
    for cname in ("fnb-pos-api-server-1", "fnb-pos-postgres-1", "fnb-pos-caddy-1"):
        rc, st = run_cmd(
            ["docker", "inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", cname],
            timeout=5,
        )
        short = cname.replace("fnb-pos-", "").replace("-1", "")
        containers.append(f"• <code>{short}</code>: {html.escape(st if rc == 0 else 'offline')}")

    units = [
        "fnb-docker-watcher.service",
        "fnb-health-probe.timer",
        "fnb-hourly-report.timer",
        "fnb-docker-prune.timer",
        "fnb-telegram-bot.service",
    ]
    _, act_out = run_cmd(["systemctl", "is-active", *units], timeout=5)
    act_lines = act_out.splitlines()
    active_count = sum(1 for s in act_lines if s.strip() == "active")

    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"🩺 <b>[{proj}] KIỂM TRA NHANH</b>",
        "────────────────",
        f"🌐 Endpoint: {health_line}",
        *containers,
        f"🛡 Giám sát VPS: <b>{active_count}/{len(units)}</b> service active",
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_vps() -> str:
    def read_cpu() -> tuple[int, int]:
        parts = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
        idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
        return sum(parts), idle

    t1, i1 = read_cpu()
    time.sleep(0.3)
    t2, i2 = read_cpu()
    cpu_pct = round(100.0 * (1.0 - (i2 - i1) / max(1, t2 - t1)), 1)

    meminfo = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meminfo[k.strip()] = int(v.strip().split()[0])

    mem_tot = meminfo.get("MemTotal", 0)
    mem_used = max(0, mem_tot - meminfo.get("MemAvailable", 0))
    ram_pct = (mem_used * 100.0 / mem_tot) if mem_tot else 0.0
    swap_tot = meminfo.get("SwapTotal", 0)
    swap_used = max(0, swap_tot - meminfo.get("SwapFree", 0))
    swap_pct = (swap_used * 100.0 / swap_tot) if swap_tot else 0.0

    du = shutil.disk_usage("/")
    disk_pct = (du.used * 100.0 / du.total) if du.total else 0.0
    loads = Path("/proc/loadavg").read_text().split()[:3]
    up_sec = int(float(Path("/proc/uptime").read_text().split()[0]))
    up_str = f"{up_sec // 86400} ngày {(up_sec % 86400) // 3600} giờ"

    _, df_out = run_cmd(["docker", "system", "df", "--format", "{{.Type}}: {{.Size}} (dọn được {{.Reclaimable}})"], timeout=10)
    _, top_out = run_cmd(["ps", "-eo", "comm,%mem,%cpu", "--sort=-%mem"], timeout=5)
    top_lines = [html.escape(l.strip()) for l in top_out.splitlines()[1:6] if l.strip()]

    if cpu_pct >= 90 or ram_pct >= 88 or disk_pct >= 85:
        badge = "🔴 Quá tải · Cần kiểm tra"
    elif cpu_pct >= 70 or ram_pct >= 75 or disk_pct >= 75:
        badge = "🟡 Hơi cao · Cần theo dõi"
    else:
        badge = "🟢 Dư dả · Ổn định"

    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"🖥 <b>[{proj}] TÀI NGUYÊN VPS CHI TIẾT</b>",
        "────────────────",
        "<b>1. Tổng quan VPS</b>",
        f"• Đánh giá: <b>{badge}</b>",
        f"• CPU ({os.cpu_count() or 1} vCPU): <b>{cpu_pct:.1f}%</b>",
        f"• Load (1/5/15m): {' / '.join(loads)}",
        f"• RAM: <b>{mem_used / 1048576:.2f}/{mem_tot / 1048576:.1f} GiB ({ram_pct:.0f}%)</b>",
        f"• Swap: {swap_used // 1024} MiB/{swap_tot / 1048576:.1f} GiB ({swap_pct:.0f}%)",
        f"• Ổ đĩa (/): <b>{du.used / (1024**3):.1f}/{du.total / (1024**3):.0f} GB ({disk_pct:.0f}%)</b>",
        f"• Uptime: {up_str}",
        "",
        "<b>2. Docker Disk</b>",
        *[f"• {html.escape(l)}" for l in df_out.splitlines() if l.strip()],
        "",
        "<b>3. Top 5 tiến trình (RAM/CPU)</b>",
        *[f"• <code>{l}</code>" for l in top_lines],
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_logs(args: list[str]) -> str:
    service = (args[0].lower() if args else "api").strip()
    service_map = {"api": "api-server", "api-server": "api-server", "caddy": "caddy", "postgres": "postgres", "db": "postgres"}
    target = service_map.get(service)
    if not target:
        return "⚠️ Tham số hợp lệ: <code>/logs api</code>, <code>/logs caddy</code> hoặc <code>/logs postgres</code>."

    rc, out = run_cmd(["docker", "compose", "logs", "--tail=15", "--no-color", target], cwd=PROJECT_DIR, timeout=10)
    if rc != 0:
        return f"🔴 Không đọc được log {target}: <code>{html.escape(out[:250])}</code>"

    lines = [redact_sensitive(l) for l in out.splitlines() if l.strip()]
    snippet = "\n".join(lines[-15:])
    if len(snippet) > 3100:
        snippet = snippet[-3100:]

    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"📜 <b>[{proj}] LOG GẦN NHẤT ({target})</b>",
        "────────────────",
        f"<pre>{html.escape(snippet)}</pre>",
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_errors() -> str:
    rc, raw_metrics = run_cmd(
        ["docker", "compose", "exec", "-T", "api-server", "wget", "-qO-", "http://127.0.0.1:3000/internal/metrics"],
        cwd=PROJECT_DIR,
        timeout=8,
    )
    req_count = slow_count = err5xx_count = 0
    if rc == 0:
        try:
            m = json.loads(raw_metrics)
            req_count = int(m.get("windowRequests", 0))
            slow_count = int(m.get("windowSlowCount", 0))
            err5xx_count = int(m.get("window5xxCount", 0))
        except Exception:
            pass

    rc_log, log_out = run_cmd(["docker", "compose", "logs", "--since=60m", "--no-color", "api-server"], cwd=PROJECT_DIR, timeout=10)
    err_lines = []
    if rc_log == 0:
        for line in log_out.splitlines():
            if any(k in line for k in ("ERROR", "500", "502", "503", "504", "Exception:")):
                err_lines.append(redact_sensitive(line))
    tail_errs = "\n".join(err_lines[-10:]) if err_lines else "Không ghi nhận dòng ERROR nào trong 60 phút qua ✅"
    if len(tail_errs) > 2800:
        tail_errs = tail_errs[-2800:]

    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"🔎 <b>[{proj}] TỔNG HỢP LỖI (1H QUA)</b>",
        "────────────────",
        f"• Thống kê cửa sổ hiện tại: <b>{req_count} req</b> · Chậm: <b>{slow_count}</b> · 5xx: <b>{err5xx_count}</b>",
        "",
        "<b>Log lỗi gần nhất:</b>",
        f"<pre>{html.escape(tail_errs)}</pre>",
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_prune() -> str:
    du_before = shutil.disk_usage("/")
    pct_before = du_before.used * 100.0 / du_before.total
    rc, out = run_cmd([str(SCRIPT_DIR / "docker-prune.sh")], cwd=PROJECT_DIR, timeout=60)
    du_after = shutil.disk_usage("/")
    pct_after = du_after.used * 100.0 / du_after.total
    reclaimed_gb = max(0.0, (du_before.used - du_after.used) / (1024**3))

    proj = html.escape(PROJECT_NAME)
    if rc != 0:
        return f"🔴 Dọn cache thất bại: <code>{html.escape(out[:300])}</code>"

    return "\n".join([
        f"🧹 <b>[{proj}] DỌN CACHE DOCKER HOÀN TẤT</b>",
        "────────────────",
        f"• Giải phóng: <b>{reclaimed_gb:.2f} GB</b>",
        f"• Ổ đĩa (/): <b>{pct_before:.1f}% → {pct_after:.1f}%</b> ({du_after.free / (1024**3):.1f} GB trống)",
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_backup() -> str:
    backup_dir = Path(PROJECT_DIR) / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now(VN_TZ).strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"backup_manual_{ts}.sql.gz"

    dump_proc = subprocess.Popen(
        ["docker", "compose", "exec", "-T", "postgres", "pg_dump", "-U", "postgres", "-d", "fnb_pos", "--no-owner", "--no-privileges"],
        cwd=PROJECT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    gzip_stderr = ""
    gzip_rc = 1
    try:
        with open(dest, "wb") as f_out:
            gzip_proc = subprocess.run(
                ["gzip", "-c"],
                stdin=dump_proc.stdout,
                stdout=f_out,
                stderr=subprocess.PIPE,
                timeout=60,
            )
        gzip_rc = gzip_proc.returncode
        gzip_stderr = gzip_proc.stderr.decode("utf-8", "replace") if gzip_proc.stderr else ""
    finally:
        if dump_proc.stdout:
            dump_proc.stdout.close()
        if dump_proc.poll() is None:
            try:
                dump_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                dump_proc.kill()
                dump_proc.wait(timeout=5)
    dump_stderr = dump_proc.stderr.read().decode("utf-8", "replace") if dump_proc.stderr else ""
    dump_rc = dump_proc.returncode or 0

    if dump_rc != 0 or gzip_rc != 0:
        dest.unlink(missing_ok=True)
        return f"🔴 Backup DB thất bại: <code>{html.escape((dump_stderr or gzip_stderr)[:250])}</code>"

    rc_test, test_out = run_cmd(["gzip", "-t", str(dest)], timeout=15)
    if rc_test != 0:
        dest.unlink(missing_ok=True)
        return f"🔴 File backup bị lỗi kiểm tra gzip: <code>{html.escape(test_out[:200])}</code>"

    size_kb = dest.stat().st_size / 1024.0
    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"💾 <b>[{proj}] SAO LƯU DATABASE THÀNH CÔNG</b>",
        "────────────────",
        f"• File: <code>{html.escape(dest.name)}</code>",
        f"• Dung lượng: <b>{size_kb:.1f} KB</b> (gzip hợp lệ ✅)",
        f"🕒 Lúc: {vn_now_str()}",
    ])


def handle_help() -> str:
    proj = html.escape(PROJECT_NAME)
    return "\n".join([
        f"🤖 <b>[{proj}] DANH SÁCH LỆNH HẠ TẦNG &amp; SERVER</b>",
        "────────────────",
        "<b>1. Kiểm tra &amp; Theo dõi (Read-only)</b>",
        "• /status — Tổng quan VPS, Docker &amp; lưu lượng API 1h",
        "• /health — Kiểm tra nhanh HTTPS, DB &amp; service",
        "• /vps — Chi tiết CPU, RAM, Swap, Disk &amp; Top tiến trình",
        "• /logs <code>[api|caddy|postgres]</code> — 15 dòng log gần nhất",
        "• /errors — Lọc lỗi 5xx / ERROR gần đây",
        "",
        "<b>2. Bảo trì chủ động an toàn</b>",
        "• /prune — Dọn Docker build cache thừa ngay",
        "• /backup — Sao lưu nóng PostgreSQL ngay lập tức",
        "• /restart_api — Khởi động lại container API (xác nhận 2 bước)",
        "",
        "ℹ️ <i>Thống kê bán hàng đã tách sang bot @POS_Lona_bot ở Nhóm Thống Kê.</i>",
    ])


def drain_stale_updates() -> int:
    """Skip historical backlog updates on daemon startup so old commands are never replayed."""
    try:
        resp = tg_api("getUpdates", {"timeout": 0, "allowed_updates": ["message"]}, timeout=10)
        results = resp.get("result", []) if resp.get("ok") else []
        if results:
            return max(int(u.get("update_id", 0)) for u in results) + 1
    except Exception as err:
        print(f"[telegram-bot] initial drain warning: {err}", file=sys.stderr)
    return 0


def main() -> int:
    if not BOT_TOKEN or not ALLOWED_CHAT_ID:
        print("[telegram-bot] Missing FNB_TELEGRAM_BOT_TOKEN or FNB_TELEGRAM_CHAT_ID; exiting cleanly.", file=sys.stderr)
        return 0

    register_bot_commands()
    offset = drain_stale_updates()
    print(f"[telegram-bot] Listening for commands in allowed chat {ALLOWED_CHAT_ID} (offset={offset})...")
    last_cmd_at = 0.0
    pending_restart_until = 0.0
    last_restart_at = 0.0

    while True:
        try:
            updates_resp = tg_api(
                "getUpdates",
                {"offset": offset, "timeout": 25, "allowed_updates": ["message"]},
                timeout=35,
            )
            if not updates_resp.get("ok"):
                time.sleep(3)
                continue

            for update in updates_resp.get("result", []):
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                msg = update.get("message")
                if not isinstance(msg, dict):
                    continue

                chat_id = str(msg.get("chat", {}).get("id", ""))
                if chat_id != ALLOWED_CHAT_ID:
                    # Strictly ignore unauthorized DMs or external groups
                    continue

                raw_text = msg.get("text") or ""
                parsed = parse_command(raw_text)
                if not parsed:
                    continue

                cmd, args = parsed
                now = time.monotonic()
                msg_id = msg.get("message_id")
                if now - last_cmd_at < MIN_COMMAND_INTERVAL_SEC:
                    continue
                last_cmd_at = now

                if cmd == "/help" or cmd == "/start":
                    reply_tg(chat_id, handle_help(), msg_id)
                elif cmd == "/status":
                    reply_tg(chat_id, handle_status(), msg_id)
                elif cmd == "/health":
                    reply_tg(chat_id, handle_health(), msg_id)
                elif cmd == "/vps":
                    reply_tg(chat_id, handle_vps(), msg_id)
                elif cmd == "/pos":
                    reply_tg(
                        chat_id,
                        "ℹ️ Lệnh <code>/pos</code> đã được tách sang bot <b>@POS_Lona_bot</b> ở Nhóm Thống Kê Quán.\n"
                        "Gõ <code>/help</code> để xem 9 lệnh hạ tầng.",
                        msg_id,
                    )
                elif cmd == "/logs":
                    reply_tg(chat_id, handle_logs(args), msg_id)
                elif cmd == "/errors":
                    reply_tg(chat_id, handle_errors(), msg_id)
                elif cmd == "/prune":
                    reply_tg(chat_id, handle_prune(), msg_id)
                elif cmd == "/backup":
                    reply_tg(chat_id, handle_backup(), msg_id)
                elif cmd == "/restart_api":
                    sub = args[0].lower() if args else ""
                    if sub != "confirm":
                        pending_restart_until = now + RESTART_CONFIRM_TTL_SEC
                        reply_tg(
                            chat_id,
                            "⚠️ <b>Xác nhận khởi động lại API Server</b>\n"
                            "POS có thể gián đoạn ~5 giây. Gõ <code>/restart_api confirm</code> trong vòng 60 giây để thực thi.",
                            msg_id,
                        )
                    elif now > pending_restart_until:
                        reply_tg(chat_id, "⌛ Yêu cầu xác nhận đã hết hạn. Vui lòng gõ lại <code>/restart_api</code> trước.", msg_id)
                    elif now - last_restart_at < RESTART_COOLDOWN_SEC:
                        wait_s = int(RESTART_COOLDOWN_SEC - (now - last_restart_at))
                        reply_tg(chat_id, f"⏳ Vui lòng chờ thêm <b>{wait_s}s</b> giữa 2 lần khởi động lại API.", msg_id)
                    else:
                        pending_restart_until = 0.0
                        last_restart_at = now
                        reply_tg(chat_id, "🔄 Đang khởi động lại container <code>api-server</code>...", msg_id)
                        rc, out = run_cmd(
                            ["docker", "compose", "up", "-d", "--wait", "--force-recreate", "--no-deps", "api-server"],
                            cwd=PROJECT_DIR,
                            timeout=60,
                        )
                        if rc == 0:
                            reply_tg(chat_id, f"✅ Container <code>api-server</code> đã khởi động lại và đạt trạng thái <b>healthy</b> lúc {vn_now_str()}.", msg_id)
                        else:
                            reply_tg(chat_id, f"🔴 Khởi động lại API thất bại: <code>{html.escape(out[:300])}</code>", msg_id)
        except Exception as err:
            print(f"[telegram-bot] loop error: {err}", file=sys.stderr)
            time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
