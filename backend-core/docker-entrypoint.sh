#!/bin/sh
# Boot the Nakama server: apply migrations, then start serving.
#
# DATABASE_ADDRESS is expected in the form:
#   user:password@host:port/dbname
set -e

DB_ADDR="${DATABASE_ADDRESS:-postgres:localdb@postgres:5432/nakama}"
RUNTIME_PATH="${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}"

echo "[backend-core] verifying Go runtime plugin..."
if ! /nakama/nakama check --runtime.path "${RUNTIME_PATH}"; then
  echo "[backend-core] FATAL: plugin check failed — rebuild with: docker compose build --no-cache backend-core"
  exit 1
fi

echo "[backend-core] running Nakama database migrations..."
if ! /nakama/nakama migrate up --database.address "${DB_ADDR}"; then
  echo "[backend-core] FATAL: Nakama migrate failed — try: docker compose down -v && ./scripts/core-up.sh"
  exit 1
fi

echo "[backend-core] starting Nakama server..."
exec /nakama/nakama \
  --database.address "${DB_ADDR}" \
  --name "${NAKAMA_NODE_NAME:-nakama-node}" \
  --logger.level "${NAKAMA_LOG_LEVEL:-INFO}" \
  --runtime.path "${RUNTIME_PATH}"
