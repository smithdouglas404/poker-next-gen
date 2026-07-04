#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_ODDS="${1:-}"

./scripts/core-up.sh

if [[ "$WITH_ODDS" == "--with-oddslingers" ]]; then
  echo ""
  ./scripts/oddslingers-up.sh
else
  echo "OddSlingers skipped. Full stack: ./scripts/live-up.sh --with-oddslingers"
fi
