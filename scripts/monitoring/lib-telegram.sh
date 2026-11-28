#!/usr/bin/env bash
# Shared Telegram notification and cooldown helpers for VPS monitoring scripts.

set -euo pipefail

MONITOR_ENV_FILE="${MONITOR_ENV_FILE:-/etc/fnb-monitor.env}"
if [[ -f "${MONITOR_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${MONITOR_ENV_FILE}"
  set +a
fi

FNB_ALERT_PROJECT_NAME="${FNB_ALERT_PROJECT_NAME:-LonaPOS}"
FNB_DOMAIN="${FNB_DOMAIN:-pos.anvattran.com}"
FNB_PROJECT_DIR="${FNB_PROJECT_DIR:-/opt/fnb-pos}"
FNB_MONITOR_STATE_DIR="${FNB_MONITOR_STATE_DIR:-/run/fnb-monitor}"

mkdir -p "${FNB_MONITOR_STATE_DIR}"

vn_timestamp() {
  TZ="Asia/Ho_Chi_Minh" date "+%H:%M:%S %d/%m/%Y"
}

vn_hour() {
  TZ="Asia/Ho_Chi_Minh" date "+%H"
}

send_telegram_message() {
  local text="${1:-}"
  if [[ -z "${FNB_TELEGRAM_BOT_TOKEN:-}" || -z "${FNB_TELEGRAM_CHAT_ID:-}" || -z "${text}" ]]; then
    return 0
  fi

  python3 - "${FNB_TELEGRAM_BOT_TOKEN}" "${FNB_TELEGRAM_CHAT_ID}" "${text}" <<'PY' || true
import json, sys, urllib.request

token, chat_id, text = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.dumps({
    "chat_id": chat_id,
    "text": text,
    "disable_web_page_preview": True,
}).encode("utf-8")
req = urllib.request.Request(
    f"https://api.telegram.org/bot{token}/sendMessage",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=8) as resp:
        resp.read()
except Exception as err:
    print(f"[telegram] send failed: {err}", file=sys.stderr)
PY
}

# Returns 0 if cooldown expired (and records new timestamp), 1 if still within cooldown.
check_and_update_cooldown() {
  local key="$1"
  local cooldown_sec="${2:-300}"
  local safe_key
  safe_key="$(printf '%s' "${key}" | tr -c 'a-zA-Z0-9_.-' '_')"
  local stamp_file="${FNB_MONITOR_STATE_DIR}/cd_${safe_key}.ts"
  local count_file="${FNB_MONITOR_STATE_DIR}/cd_${safe_key}.cnt"
  local now
  now="$(date +%s)"

  if [[ -f "${stamp_file}" ]]; then
    local last
    last="$(cat "${stamp_file}" 2>/dev/null || echo 0)"
    if (( now - last < cooldown_sec )); then
      local cur
      cur="$(cat "${count_file}" 2>/dev/null || echo 0)"
      echo "$((cur + 1))" > "${count_file}"
      return 1
    fi
  fi

  echo "${now}" > "${stamp_file}"
  echo "0" > "${count_file}"
  return 0
}
