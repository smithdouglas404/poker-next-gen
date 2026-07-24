# Command Center → Rich Screens: Workflow Map & Gap Analysis

Traced from source: `backend-core/rpc/*.go` handlers + `backend-core/models/*.go`,
the frontend rich screens, and the **oddslingers** reference (`/oddslingers`).
Purpose: for every `/hub` command, document its real flow, what the rich screens
are missing, and whether to **fix / extend / create / keep**.

---

## 1. Reference reality (oddslingers)

oddslingers — the original, "proven" platform — is actually **simpler** than our
current `backend-core` in the areas we care about:

- **No Club / Membership / Invite / Role model.** Membership = a `Player` row at a
  table (`core/poker/models.py:698`, unique `(table,user)`). Roles = table
  `created_by` and tournament `tournament_admin`. "Invite" = a private URL
  `short_id` + `is_private` gate. There is nothing to "port" for clubs — our
  backend already *introduced* that layer.
- **Tournaments = single-table 6-max freezeouts** (`Freezeout`,
  `models.py:208`). No multi-table, no rebuys/add-ons, no late-reg window.
- **No** run-it-twice / straddle / invite-codes / insurance.

**Proven mechanics worth preserving (these ARE worth taking):**
- Admin **auto-succession** on leave (`handlers.py:495-510`).
- **Inactivity auto-kick** with orbit counting (`controllers.py:581`).
- **Season-scoped double-entry ledger** — every chip auditable across
  User/Table/Cashier/Tournament (`core/banker/models.py:32`, `mutations.py:20`).
- **Per-table timebank** (base + increment + min/max) (`models.py:340-343`).
- **Action/Event pipeline** via tablebeat single-writer (`constants.py:53,76`).

---

## 2. Headline: "faces without flows" (defects — fix FIRST)

Several rich screens render richly but silently drop data — they only *look* done:

| Defect | File | What breaks |
|---|---|---|
| `PrivateTableSetup` sends ~15 fields under **wrong key names** the backend ignores | `features/lobby/PrivateTableSetup.tsx:156-175` | straddle/bomb/insurance/RIT toggles, shot-clock (`decision_time_secs`≠`action_secs`), `sponsor_club_id`≠`club_id`, KYC/geo/operating-hours/wallet-limit/auto-buyback/min-buyin-band all **no-op server-side** |
| `balance_allocate` sends `amount`, backend validates `balance` | `owner/ownerRpc.ts`, `owner/screensRpc.ts` | intended field + `min=1` validation bypassed |
| `/hands` Verify calls `audit_verify` (unregistered) | `app/hands/page.tsx:73` | Verify button always fails; correct RPC is `audit_verify_hand` |
| `tournament_create` rich panel never sends `club_id` | `features/tournaments/api.ts:25` | rich screen can only make **platform** tournaments, never club-owned |

---

## 3. Per-command map

Verdicts: **FIX** (defect) · **EXTEND** (add fields to an existing screen) ·
**CREATE** (no screen exists) · **KEEP** (console-only tool, correct) · **OK** (covered).

### A. Clubs / money — `backend-core/rpc/club.go`

| Command | RPC | Backend input depth | Rich screen | Gap | Verdict |
|---|---|---|---|---|---|
| Create Community | `club_create` | name, slug, description, currency, **accepts_global_wallet** | `app/clubs/new` | `accepts_global_wallet` missing | EXTEND |
| Browse Communities | `club_list` | — | many | none | OK |
| Add Club Owner | `club_owner_add` | club_id, user_id, role(owner/mgr/agent), **equity_bps**, **can_configure** | **NONE** | whole flow stranded | **CREATE** — Owner Hub → "Operators & Equity" |
| Allocate Player Balance | `balance_allocate` | club_id, user_id, **balance**, locked_amount, currency | MemberManagement, OwnerHub | `amount`≠`balance` bug; no currency; no locked_amount | FIX + EXTEND |
| Get Club Balance | `balance_get` | club_id, user_id | **NONE** | no screen | KEEP or fold into roster |
| Configure Rake | `rake_config_set` | club_id, name, percent_bps, **cap_minor**, **no_flop_no_drop**, **min_pot_minor**, **is_public** | `owner/GlobalSettings.tsx` (only % editable) | 4 of 6 fields not editable | EXTEND |
| Get Rake | `rake_config_get` | club_id | GlobalSettings, RakeTransparency | none | OK |
| Rake Ledger | `rake_ledger_get` | club_id | RevenueReports, Financials | none | OK |

### B. Tournaments / tables — `rpc/tournament.go`, `rpc/table.go`, `rpc/matchmaker.go`

| Command | RPC | Backend input depth | Rich screen | Gap | Verdict |
|---|---|---|---|---|---|
| Create Tournament | `tournament_create` | name, **club_id**, variant, buy_in, fee, stack, max_players, seats, scheduled_at | `CreateTournamentPanel` | no `club_id` (platform-only) | EXTEND |
| Browse / Register | `tournament_list`, `tournament_register` | — / tournament_id | `/tournaments` | none | OK |
| Add Blind Level | `blind_level_add` | tournament_id, level, sb, bb, ante, duration, is_break | wizard **auto-generates** from preset (`structures.ts`) | operator cannot set per-level SB/BB/ante/duration/breaks | EXTEND (custom editor) |
| Add Prize Tier | `prize_pool_add` | tournament_id, rank_from, rank_to, payout_bps, **guaranteed_minor** | wizard preset only | no per-tier edit; `guaranteed_minor` dead everywhere | EXTEND |
| List blinds/prizes | `blind_level_list`, `prize_pool_list` | tournament_id | FocusRail / OwnerCenter | none | OK |
| Start Tournament | `tournament_start` | tournament_id (invariants: ≥1 level, prizes=100%) | **NONE** | can't start from `/tournaments` | **CREATE** — Start control in OwnerCenter |
| Balancing Rule | `balancing_rule_set` | tournament_id, max_seat_difference, break_table_at_or_below, strategy | **NONE** | whole flow stranded | **CREATE** — "Balancing" tab |
| Create Cash Game | `table_create` | name, club_id, sb, bb, buy_in, **min/max_buyin**, seats, min_players, num_bots, variant, duration, **action_secs**, **time_bank_secs**, allow_straddle/bomb/insurance/RIT, bomb_pot_ante, war_id, league_id | `PrivateTableSetup` (rich but ~15 fields dropped) | see Headline defect | FIX + EXTEND |
| Join / List / Matchmake | `table_list`, `matchmaker_enqueue` | — / min,max,club,buyin | lobby, GameProvider | matchmaker min/max hardcoded 2/6 | OK / minor EXTEND |
| Leave / Open / Deal | (socket ops) | — | `/table` | none | OK (links) |

### C. Platform / solvers / audit

| Command | RPC | Rich screen | Verdict |
|---|---|---|---|
| healthz | `healthz` | none | KEEP (diagnostic) |
| stack_health | (Next route) | `/stack` | OK |
| Sign in / Profile / Wallet / Loyalty / KYC | `profile_get`,`wallet_get`,`loyalty_get`,`kyc_status` | `/login`,`/profile`,`/wallet`,`/loyalty`,`/kyc` | OK |
| Hand Rank, Equity, GTO, Omaha×2, Coaching | solver RPCs → engine-math | none (in-game HUD only) | **KEEP** (console is their only home) |
| Anti-Bot Score | `antibot_score` | none | KEEP (admin tool) |
| Hand History | `hand_history` | `/hands` | OK |
| Verify Hand | `audit_verify_hand` | `/hands`, `/provably-fair` | FIX (`/hands` wrong name) |

---

## 4. What this means

- **~9 commands** are legitimately console-only (solvers, health, anti-bot) → the
  console keeps a "Tools & Diagnostics" role.
- **~5 capabilities are stranded** (no rich screen): `club_owner_add`,
  `balance_get`, `tournament_start`, `balancing_rule_set` → **build into rich
  screens** before the console can shed them.
- **~4 defects** make rich screens lie about being complete → **fix first**.
- **~4 screens need field-parity extensions** (rake, club create, tournament
  create, blinds/prizes editors, table features).
- **Nothing gets deleted from the console** until its capability has a *verified*
  rich home.

---

## 5. Recommended approach (migration-first, minimal, verify each step)

- **Phase 0 — Fix "faces without flows"** (small, high-value, no new screens):
  align `table_create` keys in `PrivateTableSetup.tsx`; fix `balance_allocate`
  `amount`→`balance`; fix `/hands` `audit_verify`→`audit_verify_hand`; send
  `club_id` in tournament `api.ts`.
- **Phase 1 — Extend to field-parity:** Owner Hub `GlobalSettings` → full rake
  config; club create → `accepts_global_wallet`; `PrivateTableSetup` → surface the
  now-wired backend fields (buy-in band, shot clock, feature toggles).
- **Phase 2 — Build the missing screens/sections:** Owner Hub → "Operators &
  Equity" (`club_owner_add`, `balance_get`); `/tournaments` → custom blind & payout
  editors (port the grid already in `TournamentBuilderWizard.tsx`), a Balancing
  tab (`balancing_rule_set`), and a Start control (`tournament_start`).
- **Phase 3 — Retire duplicate console commands** only after each has a verified
  rich home; keep the ~9 solver/diagnostic tools.

**Scope guard:** every step reuses existing `backend-core` RPCs. This is not a new
system and not a big-bang rebuild — it moves/extends fields into the rich screens
and fixes defective wiring.

---

## 6. Verification

Local stack (Postgres :5433 + engine-math :8080 + Nakama :7350 with the Go
plugin). After each phase: rebuild frontend, render the touched screen against the
live backend as the seeded operator (`png-device-id=hrc-operator-demo-001`), and
confirm the field actually round-trips (set rake cap → `rake_config_get` returns
it; set per-level blinds → `blind_level_list` returns them; start a tournament →
status `running`). Commit per phase on `claude/codebase-evaluation-xnqv21`.
