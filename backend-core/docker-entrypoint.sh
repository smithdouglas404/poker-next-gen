#!/bin/sh
# Boot the Nakama server: apply migrations, then start serving.
#
# DATABASE_ADDRESS is expected in the form:
#   user:password@host:port/dbname
# On Railway, wire this from the attached PostgreSQL plugin's variables.
set -e

DB_ADDR="${DATABASE_ADDRESS:-postgres:localdb@postgres:5432/nakama}"

echo "[backend-core] running database migrations..."
/nakama/nakama migrate up --database.address "${DB_ADDR}"

echo "[backend-core] starting nakama server..."
exec /nakama/nakama \
  --database.address "${DB_ADDR}" \
  --name "${NAKAMA_NODE_NAME:-nakama-node}" \
  --logger.level "${NAKAMA_LOG_LEVEL:-INFO}" \
  --runtime.path /nakama/data/modules
