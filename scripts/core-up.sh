#!/usr/bin/env bash
# Boot the core poker stack: postgres + engine-math + Nakama + Next.js UI.
# OddSlingers is optional — run ./scripts/oddslingers-up.sh separately.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CORE=(postgres engine-math backend-core frontend-table)

echo "==> Starting core stack: ${CORE[*]}"
docker compose up --build -d "${CORE[@]}"

echo ""
echo "==> Waiting for Nakama (up to ~3 min on first build)..."
for i in $(seq 1 36); do
  if curl -sf --max-time 3 http://localhost:7350/healthcheck >/dev/null 2>&1; then
    echo "    Nakama is up."
    break
  fi
  if [[ "$i" -eq 36 ]]; then
    echo "    Nakama still not responding — run ./scripts/doctor.sh"
  fi
  sleep 5
done

echo ""
echo "Core URLs:"
echo "  UI / stack dashboard : http://localhost:3000/stack"
echo "  Nakama API           : http://localhost:7350"
echo "  engine-math          : http://localhost:8080/health"
echo ""
echo "Verify: ./scripts/stack-status.sh"
echo "OddSlingers (optional): ./scripts/oddslingers-up.sh"
