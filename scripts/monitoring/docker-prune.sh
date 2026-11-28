#!/usr/bin/env bash
# Weekly Docker cache & dangling image cleanup keeping up to 2GB build cache.

set -euo pipefail

docker image prune -f >/dev/null 2>&1 || true
docker builder prune --keep-storage=2GB -f
