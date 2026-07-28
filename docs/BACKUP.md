# Backup & data-retention plan

This document defines **what** needs to be backed up, at what cadence, and for how
long. It does not stand up backup infrastructure — that's owned by whoever manages
the Railway/Postgres deployment (see `docs/RAILWAY.md`). What follows is the data
classification the infrastructure should be built against, plus a starter script
(`backend-core/scripts/backup_critical_tables.sh`) that produces a logical export of
the tier-1 tables independent of whatever full-cluster snapshot mechanism the
infrastructure uses.

Everything here lives in one Postgres database (`backend-core/store/schema.sql` +
`backend-core/migrations/001_poker_schema.sql`). There is currently no backup config
anywhere in the repo — this is the first pass.

## Why two tiers of backup, not one

A single "snapshot the whole database nightly" policy under-serves two things at
once:

- **Regulatory/financial records** (KYC decisions, deposits, withdrawals, the
  ledger, the audit chain) need a *long, independent, tamper-evident* retention
  path — because they may need to be produced for a regulator or auditor years
  after the row was written, and because a restore of "yesterday's snapshot" is
  the wrong tool for "prove what happened to this specific deposit in March."
- **Everything else** (club chat, cosmetics, missions, avatar assets) just needs
  disaster-recovery coverage — if the database is lost, restore the latest
  snapshot and move on. No regulator asks for a club's mission-progress history.

Treating them the same either over-retains chat logs for seven years or
under-retains KYC decisions — both are wrong in different directions.

## Tier 1 — Financial & compliance record (long retention, backed up independently)

These tables are money movement, identity verification, or the tamper-evident
record of both. Recommended retention: **7 years**, matching standard AML
recordkeeping practice (FinCEN's rule is 5 years minimum; several state and card-
network requirements run longer, and 7 years is the common denominator operators
land on). Recommended handling: daily logical export (see script below) to
**immutable/WORM storage** (e.g. S3 Object Lock in compliance mode) — separate from
the general database snapshot, so these records survive even a compromised or
misconfigured primary backup pipeline, and so a specific record can be pulled
without restoring the whole cluster.

| Table | Why it's tier 1 |
|---|---|
| `poker_deposit`, `poker_withdrawal` | Real money in/out — the primary AML trail |
| `poker_wallet_ledger`, `poker_ledger_entry`, `poker_ledger_txn` | Double-entry ledger — the source of truth for every balance |
| `poker_rake_ledger`, `poker_subscription_ledger` | Club/platform revenue trail |
| `poker_audit_event`, `poker_anchor_batch` | The hash-chained, Polygon-anchored event log (see note below — the chain anchors hashes, not content) |
| `poker_kyc`, `poker_verification` | Didit KYC/AML decisions and verification status |
| `poker_admin_audit`, `poker_hitl_queue` | Every admin action and every human-in-the-loop review decision (bans, reauthorizations) |
| `poker_user_status` | Platform ban state — who was banned, by whom, why |
| `poker_global_wallet`, `poker_player_balance`, `poker_club_house_balance` | Current balances — needed to reconcile against the ledger |
| `poker_credit_request` | Over-limit buy-in approvals (money decisions) |
| `poker_collusion_flag`, `poker_player_flag` | Integrity/anti-cheat findings — may be needed for a dispute months later |
| `poker_support_ticket` | Player complaints, including money disputes |
| `poker_tournament_registration`, `poker_tournament_bounty`, `poker_settlement` | Tournament money in/out |
| `poker_recovery_code`, `poker_user_2fa` | Account-recovery secrets — losing these locks players out of their funds |

**Note on `poker_audit_event`/`poker_anchor_batch` specifically:** Polygon anchoring
(`store/anchor.go`, `rpc/anchor.go`) only ever puts a Merkle root of *hashes* on
chain — the event payloads themselves live only in Postgres. If `poker_audit_event`
is lost, the on-chain anchor can prove a hash existed but cannot reproduce what it
was a hash *of*. The anchor is tamper-evidence, not a backup — tier-1 backup of the
underlying table is what makes the anchor useful after a disaster, not a
substitute for it.

## Tier 2 — Gameplay & business data (standard DR retention)

Everything else: club structure and membership, hand history/stats, loyalty,
missions, tournaments/leagues/alliances, cosmetics/inventory, generated 3D assets,
rewards, referrals, sidebets, seat sessions. Recommended handling: covered by the
regular full-database snapshot/PITR the infrastructure already needs for disaster
recovery — no separate pipeline required. Recommended retention: **30–90 days** of
point-in-time recovery plus weekly snapshots retained ~1 year, which is enough to
recover from an operational incident without indefinitely storing low-stakes data.

Representative tables: `poker_club*`, `poker_hand_stats`, `poker_hand_index`,
`poker_loyalty`, `poker_hrp_event`, `poker_mission*`, `poker_battlepass*`,
`poker_referral`, `poker_league*`, `poker_alliance*`, `poker_reward_*`,
`poker_inventory`, `poker_cosmetic*`, `poker_generation`, `poker_model_asset`,
`poker_seat_session`, `poker_active_seat`, `poker_guest_session`,
`poker_staking_deal`, `poker_insurance`, `poker_sidebet`, `poker_rakeback`,
`poker_points_purchase`, `poker_daily_bonus`, `poker_prize_pool`,
`poker_listing`, `poker_loadout`.

## Tier 3 — Config & reference (small, low-churn, still worth keeping)

Operator-configured settings that are cheap to store but expensive to reconstruct
from memory if lost: `poker_rake_config`, `poker_geo_rule`, `poker_ip_rule`,
`poker_platform_setting`, `poker_blind_level`, `poker_balance_rule`,
`poker_room_code`, `poker_announcement`, `poker_club_announcement`,
`poker_club_schedule`. Covered by the same snapshot as tier 2 — no special
handling, just worth naming so nobody assumes config is "in git" when it's
actually operator-entered runtime state.

## Excluded from backup by design (regenerable / short-lived)

`poker_device_fingerprint`, `poker_antibot_score`, `poker_wallet_link_nonce`,
`poker_api_key` — these are either derived signals that rebuild from live traffic,
or single-use/rotatable secrets where an old value has no restore value and
lingering copies are a minor liability, not an asset.

## What is explicitly NOT covered here (infrastructure's job)

- The Postgres instance itself (base backups, PITR/WAL archiving, cross-region
  replication) — that's the "overall architecture" the user is backing up.
- Application secrets (`STRIPE_WEBHOOK_SECRET`, `NOWPAYMENTS_IPN_SECRET`,
  `DIDIT_API_KEY`, database credentials) — these live in the Railway environment,
  not the database, and need their own secret-recovery plan.
- `engine-math` and `backend-core` build artifacts — reproducible from source
  control, not data.

## Encryption & access control

Tier 1 exports contain PII (KYC documents' metadata, wallet destinations, recovery
codes) and must be encrypted at rest and in transit, with access restricted to
whoever is legally accountable for compliance recordkeeping — not the general
engineering team's default backup-bucket access. Access to a tier-1 backup should
itself be logged, the same way `poker_admin_audit` logs in-app admin actions.

## Restore drills

A backup that has never been restored is a hypothesis, not a plan. Recommend a
quarterly restore-and-verify drill: restore the latest tier-1 export plus a tier-2
snapshot into a scratch environment and confirm the double-entry ledger still
balances (`store` has the trial-balance invariant already; run it against the
restored copy) and that a sampled hand's audit chain still verifies
(`audit_verify_hand`).

## Starter script

`backend-core/scripts/backup_critical_tables.sh` runs a logical `pg_dump` scoped to
exactly the tier-1 table list above, so the infrastructure's cron/scheduler has a
single command to point at rather than needing to keep its own copy of this table
list in sync. It writes a timestamped, gzip-compressed custom-format dump to
`$BACKUP_OUT` (defaults to `./backups`); wiring that path to WORM storage and a
schedule is the infrastructure step this document hands off to.
