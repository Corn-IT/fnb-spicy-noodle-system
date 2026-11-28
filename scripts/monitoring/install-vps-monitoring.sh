#!/usr/bin/env bash
# Idempotent installer for VPS sysctl HTTP/3 tuning + systemd monitoring,
# Bot #1 (Infra Ops), PostgreSQL read-only role, and Bot #2 (@POS_Lona_bot Business AI & Reports).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${FNB_PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"

chmod +x \
  "${SCRIPT_DIR}/lib-telegram.sh" \
  "${SCRIPT_DIR}/docker-events-watcher.sh" \
  "${SCRIPT_DIR}/health-probe.sh" \
  "${SCRIPT_DIR}/hourly-report.sh" \
  "${SCRIPT_DIR}/docker-prune.sh" \
  "${SCRIPT_DIR}/telegram-command-bot.py" \
  "${SCRIPT_DIR}/telegram-biz-bot.py" \
  "${SCRIPT_DIR}/daily-biz-report.py" \
  "${SCRIPT_DIR}/biz-alert-probe.py"

# 1. Optimize UDP receive/send buffer sizes for Caddy HTTP/3 (QUIC)
cat <<'EOF' > /etc/sysctl.d/99-caddy-quic.conf
net.core.rmem_max=7500000
net.core.wmem_max=7500000
EOF
sysctl --system >/dev/null

# 2. Ensure monitoring & business bot env files exist with strict permissions
if [[ ! -f /etc/fnb-monitor.env ]]; then
  cat <<'EOF' > /etc/fnb-monitor.env
FNB_ALERT_PROJECT_NAME="Ăn Vặt Tran"
FNB_DOMAIN=pos.anvattran.com
FNB_PROJECT_DIR=/opt/fnb-pos
FNB_TELEGRAM_BOT_TOKEN=
FNB_TELEGRAM_CHAT_ID=
EOF
  chmod 600 /etc/fnb-monitor.env
fi

if [[ ! -f /etc/fnb-biz-bot.env ]]; then
  cp "${SCRIPT_DIR}/fnb-biz-bot.env.example" /etc/fnb-biz-bot.env
  chmod 600 /etc/fnb-biz-bot.env
fi

mkdir -p /var/lib/fnb-biz-alerts
chmod 750 /var/lib/fnb-biz-alerts

# 3. Apply idempotent read-only PostgreSQL role if postgres container is running
if [[ -f "${SCRIPT_DIR}/setup-bot-readonly-role.sql" ]]; then
  if (cd "${PROJECT_DIR}" && docker compose ps -q postgres | grep -q .); then
    (cd "${PROJECT_DIR}" && docker compose exec -T postgres psql -U postgres -d fnb_pos -v ON_ERROR_STOP=1 < "${SCRIPT_DIR}/setup-bot-readonly-role.sql")
    echo "[install-vps-monitoring] PostgreSQL fnb_bot_ro role & column grants synchronized."
  else
    echo "[install-vps-monitoring] postgres container not running; skipped setup-bot-readonly-role.sql."
  fi
fi

# 4. Install systemd units for Bot #1 (Infrastructure & Server Ops)
cat <<EOF > /etc/systemd/system/fnb-docker-watcher.service
[Unit]
Description=An Vat Tran Docker Events Realtime Watcher
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=${SCRIPT_DIR}/docker-events-watcher.sh
Restart=always
RestartSec=5
MemoryMax=64M

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF > /etc/systemd/system/fnb-health-probe.service
[Unit]
Description=An Vat Tran 1-Minute HTTPS Health & VPS Probe
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/health-probe.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-health-probe.timer
[Unit]
Description=Run An Vat Tran Health Probe every 1 minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-hourly-report.service
[Unit]
Description=An Vat Tran Hourly Infrastructure Report (07:00-23:00 VN)
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/hourly-report.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-hourly-report.timer
[Unit]
Description=Run An Vat Tran Hourly Infrastructure Report every hour on the hour

[Timer]
OnCalendar=*:00:00
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-docker-prune.service
[Unit]
Description=An Vat Tran Weekly Docker Build Cache Prune
After=docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/docker-prune.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-docker-prune.timer
[Unit]
Description=Run An Vat Tran Weekly Docker Prune (Sundays 04:00)

[Timer]
OnCalendar=Sun *-*-* 04:00:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-telegram-bot.service
[Unit]
Description=An Vat Tran Telegram Infra Command Bot (POS_ServerNoti)
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/telegram-command-bot.py
Restart=always
RestartSec=5
MemoryMax=64M

[Install]
WantedBy=multi-user.target
EOF

# 5. Install systemd units for Bot #2 (@POS_Lona_bot Business Stats, Reports & Alerts)
cat <<EOF > /etc/systemd/system/fnb-biz-bot.service
[Unit]
Description=An Vat Tran Business Stats & Scoped AI Bot (@POS_Lona_bot)
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/telegram-biz-bot.py
Restart=always
RestartSec=5
MemoryMax=96M

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF > /etc/systemd/system/fnb-daily-biz-report.service
[Unit]
Description=An Vat Tran Daily Close Business Report (23:00 VN)
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/daily-biz-report.py --mode daily
EOF

cat <<'EOF' > /etc/systemd/system/fnb-daily-biz-report.timer
[Unit]
Description=Send Daily Close Business Report at 23:00 Asia/Ho_Chi_Minh

[Timer]
OnCalendar=*-*-* 23:00:00 Asia/Ho_Chi_Minh
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-weekly-biz-report.service
[Unit]
Description=An Vat Tran Weekly Business Summary Report (Sunday 22:30 VN)
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/daily-biz-report.py --mode weekly
EOF

cat <<'EOF' > /etc/systemd/system/fnb-weekly-biz-report.timer
[Unit]
Description=Send Weekly Business Summary Report Sundays 22:30 Asia/Ho_Chi_Minh

[Timer]
OnCalendar=Sun *-*-* 22:30:00 Asia/Ho_Chi_Minh
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-biz-alert-probe.service
[Unit]
Description=An Vat Tran Business Alert Probe (QR limit, Pending edit, High-value Void)
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 ${SCRIPT_DIR}/biz-alert-probe.py
EOF

cat <<'EOF' > /etc/systemd/system/fnb-biz-alert-probe.timer
[Unit]
Description=Run Business Alert Probe every 2 minutes

[Timer]
OnBootSec=60s
OnUnitActiveSec=120s
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now \
  fnb-docker-watcher.service \
  fnb-health-probe.timer \
  fnb-hourly-report.timer \
  fnb-docker-prune.timer \
  fnb-telegram-bot.service \
  fnb-biz-bot.service \
  fnb-daily-biz-report.timer \
  fnb-weekly-biz-report.timer \
  fnb-biz-alert-probe.timer

echo "[install-vps-monitoring] Installed & started all Bot #1 + Bot #2 systemd units cleanly."
