#!/usr/bin/env bash
# Boot the core poker stack: postgres + engine-math + Nakama + Next.js UI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RESET="${1:-}"

if [[ "$RESET" == "--reset" ]]; then
  echo "==> Stopping stack and wiping Nakama DB volume (fixes stale/migrate errors)"
  docker compose down -v
fi

CORE=(postgres engine-math backend-core frontend-table)

echo "==> Rebuilding backend-core (Nakama plugin)..."
docker compose build --no-cache backend-core

echo "==> Starting core stack: ${CORE[*]}"
docker compose up -d "${CORE[@]}"

echo ""
echo "==> Waiting for Nakama (up to ~3 min)..."
for i in $(seq 1 36); do
  if curl -sf --max-time 3 http://localhost:7350/healthcheck >/dev/null 2>&1; then
    echo "    Nakama is up."
    exit 0
  fi
  sleep 5
done

echo ""
echo "Nakama did not become healthy. Run:"
echo "  docker compose logs backend-core --tail 80"
echo "  ./scripts/doctor.sh"
echo ""
echo "If logs mention migrate/auth errors, reset the DB volume:"
echo "  ./scripts/core-up.sh --reset"
exit 1
