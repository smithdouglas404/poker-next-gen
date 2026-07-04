#!/usr/bin/env bash
# Boot OddSlingers (Django + webpack + nginx) on :8888.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Initializing OddSlingers submodule (if needed)"
git submodule update --init --depth 1 oddslingers

echo "==> Building and starting OddSlingers (first run can take 10+ minutes)"
docker compose --profile oddslingers up --build -d \
  oddslingers-postgres oddslingers-redis oddslingers-django oddslingers-webpack oddslingers-nginx

echo ""
echo "==> Waiting for OddSlingers on :8888..."
for i in $(seq 1 36); do
  if curl -sf --max-time 3 http://localhost:8888/ >/dev/null 2>&1; then
    echo "    OddSlingers is up."
    exit 0
  fi
  sleep 5
done

echo "OddSlingers not responding yet. Check logs:"
echo "  docker compose logs oddslingers-django oddslingers-nginx --tail 50"
exit 1
