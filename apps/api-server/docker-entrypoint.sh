#!/bin/sh
set -eu

echo "[api-server] Running Prisma migrations (migrate deploy)..."
npx prisma migrate deploy

echo "[api-server] Starting NestJS application..."
exec node --import tsx dist/main.js
