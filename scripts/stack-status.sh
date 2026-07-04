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
  local required="${3:-1}"
  if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
    ok "$label — $url"
    return 0
  fi
  if [[ "$required" == "1" ]]; then
    fail "$label — $url"
  else
    warn "$label — $url (optional)"
  fi
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
core_failed=0
probe "engine-math" "http://localhost:8080/health" 1 || core_failed=$((core_failed + 1))
probe "Nakama" "http://localhost:7350/healthcheck" 1 || core_failed=$((core_failed + 1))
probe "Next.js UI" "http://localhost:3000/" 1 || core_failed=$((core_failed + 1))
probe "OddSlingers" "http://localhost:8888/" 0 || true

echo ""
if [[ "$core_failed" -eq 0 ]]; then
  ok "Core stack reachable"
  echo "  Stack dashboard: http://localhost:3000/stack"
  exit 0
fi

fail "Core stack incomplete ($core_failed required service(s) down)"
echo ""
echo "Run from repo root:"
echo "  ./scripts/core-up.sh"
echo "  ./scripts/doctor.sh"
exit 1
