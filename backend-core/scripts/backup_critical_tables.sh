#!/usr/bin/env bash
# Logical export of the tier-1 (financial/compliance) tables described in
# docs/BACKUP.md. Independent of whatever full-cluster snapshot mechanism the
# infrastructure uses — this is the targeted export that should land in
# long-retention, immutable storage (e.g. S3 Object Lock), separate from
# ordinary disaster-recovery backups.
#
# Usage: DATABASE_URL=postgres://... ./backup_critical_tables.sh [output_dir]
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
	echo "DATABASE_URL is required" >&2
	exit 1
fi

OUT_DIR="${1:-${BACKUP_OUT:-./backups}}"
mkdir -p "$OUT_DIR"

TABLES=(
	poker_deposit
	poker_withdrawal
	poker_wallet_ledger
	poker_ledger_entry
	poker_ledger_txn
	poker_rake_ledger
	poker_subscription_ledger
	poker_audit_event
	poker_anchor_batch
	poker_kyc
	poker_verification
	poker_admin_audit
	poker_hitl_queue
	poker_user_status
	poker_global_wallet
	poker_player_balance
	poker_club_house_balance
	poker_credit_request
	poker_collusion_flag
	poker_player_flag
	poker_support_ticket
	poker_tournament_registration
	poker_tournament_bounty
	poker_settlement
	poker_recovery_code
	poker_user_2fa
)

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
	TABLE_ARGS+=(--table="$t")
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/tier1-${STAMP}.dump"

pg_dump "$DATABASE_URL" --format=custom --compress=9 "${TABLE_ARGS[@]}" --file="$OUT_FILE"

echo "wrote $OUT_FILE"
