#!/usr/bin/env bash
# Realtime Docker event watcher for fnb-pos-* containers (alerts within ~1-2s on die/oom/unhealthy).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-telegram.sh
source "${SCRIPT_DIR}/lib-telegram.sh"

COOLDOWN_SEC="${FNB_DOCKER_ALERT_COOLDOWN_SEC:-300}"

handle_event() {
  local line="$1"
  local name action exit_code health_status
  IFS=$'\t' read -r name action exit_code health_status <<<"${line}"

  [[ -z "${name}" || -z "${action}" ]] && return 0

  local issue_label=""
  local proj_html
  proj_html="$(escape_tg_html "${FNB_ALERT_PROJECT_NAME}")"
  local header="🚨 <b>[${proj_html}] CẢNH BÁO CONTAINER</b>"

  case "${action}" in
    oom)
      issue_label="💥 Tràn RAM (OOM Killed)"
      ;;
    die)
      if [[ "${exit_code}" == "0" ]]; then
        return 0
      fi
      issue_label="💀 Container dừng đột ngột (exitCode=${exit_code:-unknown})"
      ;;
    health_status:*)
      if [[ "${action}" == "health_status: unhealthy" || "${health_status}" == "unhealthy" ]]; then
        issue_label="⚠️ Mất Healthcheck (UNHEALTHY)"
      elif [[ "${action}" == "health_status: healthy" || "${health_status}" == "healthy" ]]; then
        local unhealthy_flag="${FNB_MONITOR_STATE_DIR}/unhealthy_${name}"
        if [[ -f "${unhealthy_flag}" ]]; then
          rm -f "${unhealthy_flag}"
          header="🟢 <b>[${proj_html}] CONTAINER ĐÃ HỒI PHỤC</b>"
          issue_label="✅ Healthcheck hoạt động bình thường (HEALTHY)"
        else
          return 0
        fi
      else
        return 0
      fi
      ;;
    *)
      return 0
      ;;
  esac

  if [[ "${issue_label}" == *"UNHEALTHY"* ]]; then
    touch "${FNB_MONITOR_STATE_DIR}/unhealthy_${name}"
  fi

  if ! check_and_update_cooldown "docker_${name}_${action}" "${COOLDOWN_SEC}"; then
    return 0
  fi

  local recent_logs=""
  if [[ "${header}" != *"HỒI PHỤC"* ]]; then
    recent_logs="$(docker logs --tail 6 "${name}" 2>&1 | sed -E 's/(token|password|secret)=[^&[:space:]]+/\1=[REDACTED]/gi' | head -c 600 || true)"
  fi

  local mem_line
  mem_line="$(free -m | awk '/Mem:/ {printf "%d/%d MiB (%.0f%%)", $3, $2, ($3*100/$2)}' || true)"
  local load_1m
  load_1m="$(cut -d ' ' -f1 /proc/loadavg 2>/dev/null || echo '0.00')"

  local name_html
  name_html="$(escape_tg_html "${name}")"
  local issue_html
  issue_html="$(escape_tg_html "${issue_label}")"

  local msg
  msg="${header}
────────────────
<b>1. Sự kiện Container</b>
• Container: <code>${name_html}</code>
• Trạng thái: <b>${issue_html}</b>

<b>2. Tài nguyên VPS</b>
• RAM VPS: ${mem_line}
• Load (1m): ${load_1m}
• Lúc: $(vn_timestamp)"

  if [[ -n "${recent_logs}" ]]; then
    local logs_html
    logs_html="$(escape_tg_html "${recent_logs}")"
    msg="${msg}

<b>3. Log gần nhất</b>
<pre>${logs_html}</pre>"
  fi

  send_telegram_message "${msg}"
}

echo "[fnb-docker-watcher] Listening to Docker events for fnb-pos-*..."
while true; do
  while IFS= read -r event_line; do
    handle_event "${event_line}" || true
  done < <(
    docker events \
      --filter 'type=container' \
      --filter 'name=fnb-pos-' \
      --filter 'event=die' \
      --filter 'event=oom' \
      --filter 'event=health_status' \
      --format '{{.Actor.Attributes.name}}	{{.Action}}	{{.Actor.Attributes.exitCode}}	{{.Actor.Attributes.health_status}}'
  )
  sleep 2
done
