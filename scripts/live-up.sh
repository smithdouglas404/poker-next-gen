#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Initializing OddSlingers submodule (if needed)"
git submodule update --init --depth 1 oddslingers

echo "==> Starting full live stack (Nakama + rs_poker + OddSlingers + UI)"
docker compose up --build -d

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
