#!/usr/bin/env bash
# Hourly infrastructure + POS summary report sent between 07:00 and 23:00 Asia/Ho_Chi_Minh.

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
print(
    d.get("rssMb", 0),
    d.get("heapUsedMb", 0),
    d.get("windowRequests", 0),
    d.get("windowSlowCount", 0),
    d.get("window5xxCount", 0),
)
PY
)"
read -r api_rss_mb api_heap_mb win_reqs win_slow win_5xx <<<"${parsed_metrics}"

# 3. Container health & memory usage
docker_stats_text="$(docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' | grep 'fnb-pos-' | while IFS=$'\t' read -r cname mem; do
  short="${cname#fnb-pos-}"
  short="${short%-1}"
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${cname}" 2>/dev/null || echo 'unknown')"
  mem_used="${mem%%/*}"
  echo "• <code>${short}</code>: ${st} (${mem_used// /})"
done || echo '• Không lấy được dữ liệu')"

# 4. VPS Memory, Disk & Load
vps_ram_line="$(free -h | awk '/Mem:/ {printf "%s / %s", $3, $2}')"
vps_ram_pct="$(free -m | awk '/Mem:/ {printf "%.0f%%", ($3*100/$2)}')"
vps_disk_line="$(df -h / | awk 'NR==2 {printf "%s / %s (%s)", $3, $2, $5}')"
load_1m_5m="$(awk '{print $1 " / " $2}' /proc/loadavg 2>/dev/null || echo '0.00 / 0.00')"

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
<b>1. Tổng quan</b>
${health_summary}
🌐 Tên miền: <code>${domain_html}</code>
🕒 Lúc: $(vn_timestamp)

<b>2. Container Docker</b>
${docker_stats_text}

<b>3. Tài nguyên API &amp; VPS</b>
• RAM VPS: ${vps_ram_line} (${vps_ram_pct})
• Ổ đĩa (/): ${vps_disk_line}
• Load (1m/5m): ${load_1m_5m}
• API RSS: ${api_rss_mb} MB
• V8 Heap: ${api_heap_mb} MB

<b>4. Hoạt động quán</b>
• Đơn hôm nay: <b>${orders_today} đơn</b>
• Bàn đang có khách: <b>${occupied_tables}/${total_tables} bàn</b>
• 1h qua: <b>${win_reqs} req</b> · Chậm: <b>${win_slow}</b> · 5xx: <b>${win_5xx}</b>"

send_telegram_message "${msg}"
