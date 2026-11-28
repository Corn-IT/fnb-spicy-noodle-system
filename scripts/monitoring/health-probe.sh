#!/usr/bin/env bash
# 1-minute production health, disk (>=85%), and VPS RAM (>=90%) probe with state-change & 15m reminder alerts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-telegram.sh
source "${SCRIPT_DIR}/lib-telegram.sh"

HEALTH_URL="${FNB_HEALTH_URL:-https://${FNB_DOMAIN}/api/v1/health}"
DISK_WARN_PCT="${FNB_DISK_WARN_PCT:-85}"
RAM_WARN_PCT="${FNB_RAM_WARN_PCT:-90}"
DOWN_REMIND_SEC="${FNB_DOWN_REMIND_SEC:-900}"

STATE_FILE="${FNB_MONITOR_STATE_DIR}/health_state"
DOWN_SINCE_FILE="${FNB_MONITOR_STATE_DIR}/health_down_since"
LAST_REMIND_FILE="${FNB_MONITOR_STATE_DIR}/health_last_remind"

check_health_once() {
  python3 - "${HEALTH_URL}" <<'PY'
import json, sys, time, urllib.request

url = sys.argv[1]
t0 = time.monotonic()
try:
    req = urllib.request.Request(url, headers={"User-Agent": "LonaPOS-HealthProbe/1.0"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        ms = int((time.monotonic() - t0) * 1000)
        body = json.loads(resp.read().decode("utf-8"))
        if resp.status == 200 and body.get("status") == "ok" and body.get("database") == "connected":
            print(f"OK {ms}")
            sys.exit(0)
        print(f"FAIL status={resp.status} db={body.get('database')} ({ms}ms)")
        sys.exit(1)
except Exception as err:
    ms = int((time.monotonic() - t0) * 1000)
    print(f"FAIL {err} ({ms}ms)")
    sys.exit(1)
PY
}

probe_out=""
probe_ok=1
if probe_out="$(check_health_once)"; then
  probe_ok=0
else
  # Retry once after 5s to suppress transient network hiccups
  sleep 5
  if probe_out="$(check_health_once)"; then
    probe_ok=0
  fi
fi

prev_state="$(cat "${STATE_FILE}" 2>/dev/null || echo 'UP')"
now="$(date +%s)"
load_1m="$(cut -d ' ' -f1 /proc/loadavg 2>/dev/null || echo '0.00')"
mem_info="$(free -m | awk '/Mem:/ {printf "%d/%d MiB (%.0f%%)", $3, $2, ($3*100/$2)}')"
disk_pct="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"

if (( probe_ok == 0 )); then
  if [[ "${prev_state}" == "DOWN" ]]; then
    down_since="$(cat "${DOWN_SINCE_FILE}" 2>/dev/null || echo "${now}")"
    downtime_sec="$(( now - down_since ))"
    latency_ms="${probe_out#OK }"
    echo "UP" > "${STATE_FILE}"
    rm -f "${DOWN_SINCE_FILE}" "${LAST_REMIND_FILE}"

    send_telegram_message "🟢 [${FNB_ALERT_PROJECT_NAME}] SERVICE RECOVERED
────────────────────
📍 Project: ${FNB_ALERT_PROJECT_NAME} | Env: PRODUCTION
🌐 Endpoint: ${HEALTH_URL}
────────────────────
✅ Status: HEALTHY (${latency_ms}ms)
⏱️ Downtime: ${downtime_sec} giây
📦 VPS: RAM ${mem_info} | Disk ${disk_pct}% | Load ${load_1m}
────────────────────
⏰ At: $(vn_timestamp)"
  else
    echo "UP" > "${STATE_FILE}"
  fi
else
  if [[ "${prev_state}" != "DOWN" ]]; then
    echo "DOWN" > "${STATE_FILE}"
    echo "${now}" > "${DOWN_SINCE_FILE}"
    echo "${now}" > "${LAST_REMIND_FILE}"

    send_telegram_message "🔴 [${FNB_ALERT_PROJECT_NAME}] SERVICE DOWN
────────────────────
📍 Project: ${FNB_ALERT_PROJECT_NAME} | Env: PRODUCTION
🌐 Endpoint: ${HEALTH_URL}
────────────────────
🚨 Issue: ${probe_out}
📦 VPS: RAM ${mem_info} | Disk ${disk_pct}% | Load ${load_1m}
────────────────────
⏰ At: $(vn_timestamp)"
  else
    last_rem="$(cat "${LAST_REMIND_FILE}" 2>/dev/null || echo 0)"
    if (( now - last_rem >= DOWN_REMIND_SEC )); then
      down_since="$(cat "${DOWN_SINCE_FILE}" 2>/dev/null || echo "${now}")"
      down_min="$(( (now - down_since) / 60 ))"
      echo "${now}" > "${LAST_REMIND_FILE}"

      send_telegram_message "🔴 [${FNB_ALERT_PROJECT_NAME}] STILL DOWN (${down_min} phút)
────────────────────
🌐 Endpoint: ${HEALTH_URL}
🚨 Issue: ${probe_out}
📦 VPS: RAM ${mem_info} | Disk ${disk_pct}% | Load ${load_1m}
────────────────────
⏰ At: $(vn_timestamp)"
    fi
  fi
fi

# Resource threshold checks (independent of healthcheck status, 30m cooldown)
ram_pct="$(free -m | awk '/Mem:/ {printf "%d", ($3*100/$2)}')"
if (( disk_pct >= DISK_WARN_PCT )); then
  if check_and_update_cooldown "vps_disk_high" 1800; then
    send_telegram_message "⚠️ [${FNB_ALERT_PROJECT_NAME}] HIGH DISK USAGE
────────────────────
📍 Project: ${FNB_ALERT_PROJECT_NAME} | Env: PRODUCTION
💽 Disk (/): ${disk_pct}% / ngưỡng ${DISK_WARN_PCT}%
📦 RAM: ${mem_info} | Load: ${load_1m}
────────────────────
⏰ At: $(vn_timestamp)"
  fi
fi

if (( ram_pct >= RAM_WARN_PCT )); then
  if check_and_update_cooldown "vps_ram_high" 1800; then
    send_telegram_message "⚠️ [${FNB_ALERT_PROJECT_NAME}] HIGH VPS MEMORY
────────────────────
📍 Project: ${FNB_ALERT_PROJECT_NAME} | Env: PRODUCTION
💾 VPS RAM: ${mem_info} (ngưỡng ${RAM_WARN_PCT}%)
💽 Disk (/): ${disk_pct}% | Load: ${load_1m}
────────────────────
⏰ At: $(vn_timestamp)"
  fi
fi
