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
# Session lifetimes. Nakama's defaults are 60s access / 3600s refresh, and it
# WARNS about both on every boot; nothing set them, so production ran on them.
#
# 60s is shorter than nakama-js's own auto-refresh window
# (DEFAULT_EXPIRED_TIMESPAN_MS = 300s), so the client re-refreshed the session on
# EVERY rpc — two HTTP round trips per call, measured at ~1 refresh per request.
# 900s puts the token comfortably outside that window, so a refresh happens
# roughly every 10 minutes instead. 86400s of refresh keeps a same-day session
# alive so "sign in again" stays rare without minting week-long bearer tokens.
#
# Both are env-overridable: tune without a code change.
exec /nakama/nakama \
  --database.address "${DB_ADDR}" \
  --name "${NAKAMA_NODE_NAME:-nakama-node}" \
  --logger.level "${NAKAMA_LOG_LEVEL:-INFO}" \
  --runtime.path "${RUNTIME_PATH}" \
  --runtime.http_key "${NAKAMA_HTTP_KEY:-defaultkey}" \
  --session.token_expiry_sec "${NAKAMA_TOKEN_EXPIRY_SEC:-900}" \
  --session.refresh_token_expiry_sec "${NAKAMA_REFRESH_TOKEN_EXPIRY_SEC:-86400}"
