#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Initializing OddSlingers submodule (if needed)"
git submodule update --init --depth 1 oddslingers

echo "==> Starting full live stack (Nakama + rs_poker + OddSlingers + UI)"
docker compose up --build -d

echo ""
echo "==> Waiting for core services (up to ~2 min on first build)..."
for i in $(seq 1 24); do
  if curl -sf --max-time 3 http://localhost:7350/healthcheck >/dev/null 2>&1 \
    && curl -sf --max-time 3 http://localhost:8080/health >/dev/null 2>&1; then
    echo "    Nakama + engine-math are up."
    break
  fi
  sleep 5
done

echo ""
echo "Live URLs:"
echo "  Command Center / Table UI : http://localhost:3000"
echo "  Live stack dashboard      : http://localhost:3000/stack"
echo "  Nakama API                : http://localhost:7350"
echo "  Nakama Console            : http://localhost:7351"
echo "  rs_poker engine-math      : http://localhost:8080/health"
echo "  OddSlingers platform      : http://localhost:8888"
echo ""
echo "Tail logs: docker compose logs -f"
echo "Verify:    ./scripts/stack-status.sh"
