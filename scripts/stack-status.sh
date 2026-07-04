#!/usr/bin/env bash
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

probe() {
  local label="$1"
  local url="$2"
  if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
    ok "$label — $url"
    return 0
  fi
  fail "$label — $url"
  return 1
}

echo "==> Docker containers"
if command -v docker >/dev/null 2>&1; then
  docker compose ps 2>/dev/null || warn "docker compose ps failed (run from repo root)"
else
  warn "docker not in PATH — skipping container list"
fi

echo ""
echo "==> HTTP probes"
failed=0
probe "engine-math" "http://localhost:8080/health" || failed=$((failed + 1))
probe "Nakama" "http://localhost:7350/healthcheck" || failed=$((failed + 1))
probe "OddSlingers" "http://localhost:8888/" || failed=$((failed + 1))
probe "Next.js UI" "http://localhost:3000/" || failed=$((failed + 1))

echo ""
if [[ "$failed" -eq 0 ]]; then
  ok "All services reachable"
  echo "  Stack dashboard: http://localhost:3000/stack"
else
  fail "$failed service(s) unreachable"
  echo ""
  echo "Common fixes:"
  echo "  1. Boot full stack:  ./scripts/live-up.sh"
  echo "  2. Port conflicts:   ss -tlnp | grep -E ':(5432|7350|8080|8888|3000) '"
  echo "  3. Nakama logs:      docker compose logs backend-core --tail 50"
  echo "  4. OddSlingers logs: docker compose logs oddslingers-django oddslingers-nginx --tail 50"
  exit 1
fi
