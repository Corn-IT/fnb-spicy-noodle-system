#!/usr/bin/env bash
# Hourly infrastructure + VPS telemetry + POS summary report sent between 07:00 and 23:00 Asia/Ho_Chi_Minh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-telegram.sh
source "${SCRIPT_DIR}/lib-telegram.sh"

HOUR_VN="$(vn_hour)"
if [[ "${1:-}" != "--force" ]]; then
  if (( 10#${HOUR_VN} < 7 || 10#${HOUR_VN} > 23 )); then
    exit 0
  fi
fi

cd "${FNB_PROJECT_DIR}"

HEALTH_URL="${FNB_HEALTH_URL:-https://${FNB_DOMAIN}/api/v1/health}"

# 1. Measure public HTTPS endpoint health & latency
health_summary="$(python3 - "${HEALTH_URL}" <<'PY'
import html, json, sys, time, urllib.request
t0 = time.monotonic()
try:
    req = urllib.request.Request(sys.argv[1], headers={"User-Agent": "LonaPOS-HourlyReport/1.0"})
    with urllib.request.urlopen(req, timeout=8) as r:
        ms = int((time.monotonic() - t0) * 1000)
        body = json.loads(r.read().decode("utf-8"))
        if r.status == 200 and body.get("status") == "ok" and body.get("database") == "connected":
            print(f"🟢 Trạng thái: <b>Ổn định</b> (HTTPS 200 · {ms}ms)")
        else:
            db_st = html.escape(str(body.get("database")))
            print(f"🟡 Trạng thái: <b>Cảnh báo</b> (HTTP {r.status} · DB={db_st})")
except Exception as err:
    err_s = html.escape(str(err))
    print(f"🔴 Trạng thái: <b>Mất kết nối</b> ({err_s})")
PY
)"

# 2. Fetch internal loopback metrics & reset 1h counters (no internet exposure)
metrics_json="$(docker compose exec -T api-server wget -qO- 'http://127.0.0.1:3000/internal/metrics?reset=1' 2>/dev/null || echo '{}')"
parsed_metrics="$(python3 - "${metrics_json}" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    d = {}
uptime_sec = int(d.get("uptimeSeconds", 0) or 0)
if uptime_sec >= 86400:
    up_str = f"{uptime_sec // 86400} ngày {(uptime_sec % 86400) // 3600} giờ"
elif uptime_sec >= 3600:
    up_str = f"{uptime_sec // 3600} giờ {(uptime_sec % 3600) // 60} phút"
else:
    up_str = f"{max(0, uptime_sec // 60)} phút"
print("|".join([
    str(d.get("rssMb", 0)),
    str(d.get("heapUsedMb", 0)),
    str(d.get("windowRequests", 0)),
    str(d.get("windowSlowCount", 0)),
    str(d.get("window5xxCount", 0)),
    up_str,
]))
PY
)"
IFS='|' read -r api_rss_mb api_heap_mb win_reqs win_slow win_5xx api_uptime_str <<<"${parsed_metrics}"

# 3. VPS CPU %, RAM, Swap, Disk, Uptime & Overall Health Assessment
vps_telemetry="$(python3 - <<'PY'
import shutil, subprocess, time

def read_cpu():
    with open("/proc/stat") as f:
        parts = list(map(int, f.readline().split()[1:]))
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return sum(parts), idle

t1, i1 = read_cpu()
time.sleep(0.3)
t2, i2 = read_cpu()
cpu_pct = round(100.0 * (1.0 - (i2 - i1) / max(1, t2 - t1)), 1)

mem_total = mem_avail = swap_total = swap_free = 0
with open("/proc/meminfo") as f:
    for line in f:
        k, v = line.split(":", 1)
        val_kb = int(v.strip().split()[0])
        if k == "MemTotal": mem_total = val_kb
        elif k == "MemAvailable": mem_avail = val_kb
        elif k == "SwapTotal": swap_total = val_kb
        elif k == "SwapFree": swap_free = val_kb

mem_used_kb = max(0, mem_total - mem_avail)
ram_pct = round((mem_used_kb * 100.0 / mem_total), 1) if mem_total > 0 else 0.0
ram_used_gib = mem_used_kb / (1024 * 1024)
ram_total_gib = mem_total / (1024 * 1024)

swap_used_kb = max(0, swap_total - swap_free)
swap_pct = round((swap_used_kb * 100.0 / swap_total), 1) if swap_total > 0 else 0.0
swap_used_mib = int(round(swap_used_kb / 1024))
swap_total_gib = swap_total / (1024 * 1024)

du = shutil.disk_usage("/")
disk_pct = round((du.used * 100.0 / du.total), 1) if du.total > 0 else 0.0
disk_used_gb = du.used / (1024 ** 3)
disk_total_gb = du.total / (1024 ** 3)

with open("/proc/loadavg") as f:
    loads = f.read().split()[:2]

with open("/proc/uptime") as f:
    up_sec = int(float(f.read().split()[0]))
up_days = up_sec // 86400
up_hours = (up_sec % 86400) // 3600
up_mins = (up_sec % 3600) // 60
up_str = f"{up_days} ngày {up_hours} giờ" if up_days > 0 else f"{up_hours} giờ {up_mins} phút"

try:
    cpus = int(subprocess.check_output(["nproc"], text=True).strip())
except Exception:
    cpus = 1

if cpu_pct >= 90 or ram_pct >= 88 or disk_pct >= 85:
    badge = "🔴 Quá tải · Cần kiểm tra"
elif cpu_pct >= 70 or ram_pct >= 75 or disk_pct >= 75:
    badge = "🟡 Hơi cao · Cần theo dõi"
else:
    badge = "🟢 Dư dả · Ổn định"

print("|".join([
    badge,
    str(cpus),
    f"{cpu_pct:.1f}%",
    f"{loads[0]} / {loads[1]}",
    f"{ram_used_gib:.2f}/{ram_total_gib:.1f} GiB ({ram_pct:.0f}%)",
    f"{swap_used_mib} MiB/{swap_total_gib:.1f} GiB ({swap_pct:.0f}%)",
    f"{disk_used_gb:.1f}/{disk_total_gb:.0f} GB ({disk_pct:.0f}%)",
    up_str,
]))
PY
)"
IFS='|' read -r vps_badge vps_cpus vps_cpu_pct load_1m_5m vps_ram_str vps_swap_str vps_disk_str vps_uptime_str <<<"${vps_telemetry}"

docker_cache_line="$(docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}' 2>/dev/null | awk -F'|' '$1=="Build Cache" {print $2 " (dọn được " $3 ")"}' || true)"
[[ -z "${docker_cache_line}" ]] && docker_cache_line="0B"

# 4. Container health, individual stats, and combined POS footprint vs total VPS RAM
docker_stats_raw="$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' | grep 'fnb-pos-' || true)"
docker_stats_text=""
pos_sum_info="$(python3 - "${docker_stats_raw}" "${vps_ram_str}" <<'PY'
import re, sys

raw_lines = [l for l in sys.argv[1].splitlines() if l.strip()]
vps_ram_str = sys.argv[2]
# Extract total GiB from e.g. "0.94/3.8 GiB (24%)"
m_tot = re.search(r'/([0-9.]+)\s*GiB', vps_ram_str)
vps_total_mib = float(m_tot.group(1)) * 1024 if m_tot else 3916.0

def to_mib(val_str: str) -> float:
    m = re.match(r'^([0-9.]+)\s*([A-Za-z]+)$', val_str.strip())
    if not m:
        return 0.0
    num, unit = float(m.group(1)), m.group(2).lower()
    if unit.startswith('g'):
        return num * 1024.0
    if unit.startswith('k'):
        return num / 1024.0
    return num

total_cpu = 0.0
total_mib = 0.0
for line in raw_lines:
    parts = line.split('|')
    if len(parts) != 3:
        continue
    cpu_val = float(parts[1].replace('%', '').strip() or 0)
    used_part = parts[2].split('/')[0].strip()
    total_cpu += cpu_val
    total_mib += to_mib(used_part)

ram_share_pct = (total_mib * 100.0 / vps_total_mib) if vps_total_mib > 0 else 0.0
print(f"{total_mib:.1f} MiB ({ram_share_pct:.1f}% RAM VPS)|{total_cpu:.1f}%")
PY
)"
IFS='|' read -r pos_ram_total_str pos_cpu_total_str <<<"${pos_sum_info}"

docker_stats_text="$(while IFS='|' read -r cname ccpu cmem; do
  [[ -z "${cname}" ]] && continue
  short="${cname#fnb-pos-}"
  short="${short%-1}"
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${cname}" 2>/dev/null || echo 'unknown')"
  mem_used="${cmem%%/*}"
  echo "• <code>${short}</code>: ${st} (${mem_used// /} · CPU ${ccpu})"
done <<<"${docker_stats_raw}")"
[[ -z "${docker_stats_text}" ]] && docker_stats_text="• Không lấy được dữ liệu"

# 5. Lightweight daily POS activity snapshot (VN timezone day)
pos_counts="$(docker compose exec -T postgres psql -U postgres -d fnb_pos -Atc "
  SELECT
    (SELECT count(*) FROM orders WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') || ' ' ||
    (SELECT count(*) FROM dining_tables WHERE status = 'OCCUPIED') || ' ' ||
    (SELECT count(*) FROM dining_tables);
" 2>/dev/null || echo '0 0 0')"
read -r orders_today occupied_tables total_tables <<<"${pos_counts}"

proj_html="$(escape_tg_html "${FNB_ALERT_PROJECT_NAME}")"
domain_html="$(escape_tg_html "${FNB_DOMAIN}")"

msg="📊 <b>[${proj_html}] BÁO CÁO HỆ THỐNG (1H)</b>
────────────────
<b>1. Tổng quan dịch vụ</b>
${health_summary}
🌐 Tên miền: <code>${domain_html}</code>
🕒 Lúc: $(vn_timestamp)

<b>2. Tài nguyên toàn VPS</b>
• Đánh giá: <b>${vps_badge}</b>
• CPU (${vps_cpus} vCPU): <b>${vps_cpu_pct}</b>
• Load (1m/5m): ${load_1m_5m}
• RAM VPS: <b>${vps_ram_str}</b>
• Swap: ${vps_swap_str}
• Ổ đĩa (/): <b>${vps_disk_str}</b>
• Build Cache: ${docker_cache_line}
• Uptime VPS: ${vps_uptime_str}

<b>3. Hệ thống POS (Docker)</b>
• Tổng POS chiếm: <b>${pos_ram_total_str}</b> · CPU <b>${pos_cpu_total_str}</b>
${docker_stats_text}

<b>4. Tiến trình API</b>
• RSS thực tế: ${api_rss_mb} MB
• V8 Heap: ${api_heap_mb} MB
• Uptime API: ${api_uptime_str}

<b>5. Hoạt động quán</b>
• Đơn hôm nay: <b>${orders_today} đơn</b>
• Bàn có khách: <b>${occupied_tables}/${total_tables} bàn</b>
• 1h qua: <b>${win_reqs} req</b> · Chậm: <b>${win_slow}</b> · 5xx: <b>${win_5xx}</b>"

send_telegram_message "${msg}"
