#!/usr/bin/env bash
# Idempotent installer for VPS sysctl HTTP/3 tuning + systemd monitoring services/timers (Ubuntu 24.04+).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

chmod +x \
  "${SCRIPT_DIR}/lib-telegram.sh" \
  "${SCRIPT_DIR}/docker-events-watcher.sh" \
  "${SCRIPT_DIR}/health-probe.sh" \
  "${SCRIPT_DIR}/hourly-report.sh" \
  "${SCRIPT_DIR}/docker-prune.sh"

# 1. Mục 4A: Optimize UDP receive/send buffer sizes for Caddy HTTP/3 (QUIC)
cat <<'EOF' > /etc/sysctl.d/99-caddy-quic.conf
net.core.rmem_max=7500000
net.core.wmem_max=7500000
EOF
sysctl --system >/dev/null

# 2. Ensure monitoring env file exists with strict permissions
if [[ ! -f /etc/fnb-monitor.env ]]; then
  cat <<'EOF' > /etc/fnb-monitor.env
FNB_ALERT_PROJECT_NAME=LonaPOS
FNB_DOMAIN=pos.anvattran.com
FNB_PROJECT_DIR=/opt/fnb-pos
FNB_TELEGRAM_BOT_TOKEN=
FNB_TELEGRAM_CHAT_ID=
EOF
  chmod 600 /etc/fnb-monitor.env
fi

# 3. Install systemd units
cat <<EOF > /etc/systemd/system/fnb-docker-watcher.service
[Unit]
Description=LonaPOS Docker Events Realtime Watcher
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
Description=LonaPOS 1-Minute HTTPS Health & VPS Probe
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/health-probe.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-health-probe.timer
[Unit]
Description=Run LonaPOS Health Probe every 1 minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-hourly-report.service
[Unit]
Description=LonaPOS Hourly Health Report (07:00-23:00 VN)
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/hourly-report.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-hourly-report.timer
[Unit]
Description=Run LonaPOS Hourly Health Report every hour on the hour

[Timer]
OnCalendar=*:00:00
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF

cat <<EOF > /etc/systemd/system/fnb-docker-prune.service
[Unit]
Description=LonaPOS Weekly Docker Build Cache Prune
After=docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/docker-prune.sh
EOF

cat <<'EOF' > /etc/systemd/system/fnb-docker-prune.timer
[Unit]
Description=Run LonaPOS Weekly Docker Prune (Sundays 04:00)

[Timer]
OnCalendar=Sun *-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now \
  fnb-docker-watcher.service \
  fnb-health-probe.timer \
  fnb-hourly-report.timer \
  fnb-docker-prune.timer

echo "[install-vps-monitoring] Installed & started all systemd units cleanly."
