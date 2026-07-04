#!/bin/sh
# Boot the Nakama server: apply migrations, then start serving.
#
# Nakama expects database.address as:
#   user:password@host:port/dbname?sslmode=...
# Railway Postgres provides DATABASE_URL / DATABASE_ADDRESS as:
#   postgresql://user:password@host:port/dbname
set -e

RUNTIME_PATH="${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}"

resolve_db_addr() {
  addr=""

  if [ -n "${PGHOST:-}" ] && [ -n "${PGUSER:-}" ] && [ -n "${PGDATABASE:-}" ]; then
    port="${PGPORT:-5432}"
    addr="${PGUSER}:${PGPASSWORD:-}@${PGHOST}:${port}/${PGDATABASE}"
  else
    addr="${DATABASE_ADDRESS:-${DATABASE_URL:-postgres:localdb@postgres:5432/nakama}}"
  fi

  case "$addr" in
    postgres://*) addr="${addr#postgres://}" ;;
    postgresql://*) addr="${addr#postgresql://}" ;;
  esac

  case "$addr" in
    *sslmode=*)
      ;;
    *railway.internal*|*@postgres:5432*)
      addr="${addr}?sslmode=disable"
      ;;
    *)
      addr="${addr}?sslmode=require"
      ;;
  esac

  printf '%s' "$addr"
}

DB_ADDR="$(resolve_db_addr)"
# Log host/db only — never print credentials.
DB_LOG="$(printf '%s' "$DB_ADDR" | sed -E 's/^[^@]+@/****@/')"
echo "[backend-core] database target: ${DB_LOG}"

echo "[backend-core] verifying Go runtime plugin..."
if ! /nakama/nakama check --runtime.path "${RUNTIME_PATH}"; then
  echo "[backend-core] FATAL: plugin check failed — rebuild backend-core image"
  exit 1
fi

echo "[backend-core] running Nakama database migrations..."
if ! /nakama/nakama migrate up --database.address "${DB_ADDR}"; then
  echo "[backend-core] FATAL: Nakama migrate failed"
  exit 1
fi

echo "[backend-core] starting Nakama server..."
exec /nakama/nakama \
  --database.address "${DB_ADDR}" \
  --name "${NAKAMA_NODE_NAME:-nakama-node}" \
  --logger.level "${NAKAMA_LOG_LEVEL:-INFO}" \
  --runtime.path "${RUNTIME_PATH}"
