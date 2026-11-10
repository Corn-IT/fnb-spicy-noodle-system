#!/bin/sh
# Backup script — pg_dump compressed, upload to Cloudflare R2
# Scheduled via cron at 03:00 daily

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/fnb_pos_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h db \
  -U fnb \
  -d fnb_pos \
  --no-owner \
  --no-privileges \
  | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup created: ${BACKUP_FILE}"

# Upload to Cloudflare R2 (requires aws CLI configured with R2 credentials)
if [ -n "${FNB_R2_BUCKET_NAME:-}" ] && [ -n "${FNB_R2_ACCESS_KEY_ID:-}" ]; then
  export AWS_ACCESS_KEY_ID="${FNB_R2_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${FNB_R2_SECRET_ACCESS_KEY}"

  aws s3 cp "${BACKUP_FILE}" \
    "s3://${FNB_R2_BACKUP_BUCKET:-fnb-pos-backups}/daily/${TIMESTAMP}.sql.gz" \
    --endpoint-url "https://${FNB_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

  echo "[$(date)] Uploaded to R2: daily/${TIMESTAMP}.sql.gz"
fi

# Cleanup local backup
rm -f "${BACKUP_FILE}"

echo "[$(date)] Backup complete."
