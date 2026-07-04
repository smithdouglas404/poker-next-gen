#!/usr/bin/env bash
# Diagnose why Nakama / OddSlingers show down on http://localhost:3000/stack
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { printf "${GREEN}✓${NC} %s\n" "$1"; }
fail() { printf "${RED}✗${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker not found in PATH"
  exit 1
fi

echo "==> Container status"
docker compose ps -a 2>/dev/null || { fail "Run from repo root (poker-next-gen)"; exit 1; }

echo ""
echo "==> Port listeners (host)"
for port in 5432 5433 7350 8080 8888 3000; do
  if command -v lsof >/dev/null 2>&1; then
    who=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1 || true)
    if [[ -n "$who" ]]; then
      warn "Port $port in use: $who"
    else
      ok "Port $port free"
    fi
  fi
done

echo ""
echo "==> HTTP probes"
probe() {
  local label="$1" url="$2"
  if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then ok "$label — $url"; else fail "$label — $url"; fi
}
probe "engine-math" "http://localhost:8080/health"
probe "Nakama" "http://localhost:7350/healthcheck"
probe "OddSlingers" "http://localhost:8888/"
probe "Next.js" "http://localhost:3000/"

echo "==> Recent backend-core logs"
docker compose logs backend-core --tail 40 2>/dev/null || true

echo ""
echo "==> Fixes"
echo "  Core stack (Nakama):     ./scripts/core-up.sh"
echo "  OddSlingers (optional):  ./scripts/oddslingers-up.sh"
echo "  Full stack:              ./scripts/live-up.sh"
echo ""
echo "If port 5432 is taken on your Mac, Nakama postgres uses host port 5433 (internal 5432)."
echo "If backend-core keeps restarting: docker compose logs backend-core --tail 100"
