# Capability Wiring Roadmap

Goal: wire up **100% of the advanced capabilities** of the three systems this
platform is built on — **rs-poker** (Rust engine), **Nakama** (Go game server),
and **OddSlingers** (reference platform) — rather than using only their basics.

This doc is the synthesis of three capability audits (what each system offers vs.
what the repo actually uses today) plus a phased, verifiable execution plan.

## Guiding constraint

Golden Rule #4 stands: **rs_poker is the sole authoritative engine, no fallbacks.**
So OddSlingers splits into two buckets:
- **UX/feature layer** (chat, sound, animations, replays, bots' *decision logic*) →
  port on top of Nakama + rs_poker. ✅ safe.
- **Engine layer** (its Python hand eval / state machine / shuffle) → **do not port**;
  rs_poker owns that. ❌ conflicts.

Bots are allowed **only** if their equity/hand-strength is sourced from rs_poker,
never from OddSlingers' own eval.

---

## Where each system stands (used vs. unused)

### rs-poker (engine-math)
Used today: `Hand`/`Rank` eval, `MonteCarloGame::estimate_equity`, `OmahaHand`.
Everything else is compiled in (default features `arena`, `omaha`, `open-hand-history`)
but unused. Biggest unused capabilities:
- **`arena::cfr` — real CFR/GTO solver** (PCFR+, deadline-bounded). ← the #1 gap.
- `holdem::RangeParser` / `StartingHand` — range strings ("99+", "AKs").
- `holdem::OutsCalculator` — exact (zero-variance) equity + outs/draws.
- `simulated_icm::simulate_icm_tournament` — ICM $-equity for the tournament model.
- `arena` sim + `SingleTableTournament` + agents (`CallingAgent`…) — server-side
  simulation & house bots.
- `arena::cfr::export_to_svg/png` — GTO strategy-tree visuals.
- Preflop charts (`PreflopChart`/`PreflopStrategy`).

### Nakama (backend-core)
Uses Nakama as an authoritative-match + RPC runtime only. **Re-invented natively
(should consolidate onto Nakama):**
- **Wallet** → hand-rolled `poker_global_wallet` (non-atomic, no ledger) vs
  `WalletUpdate`/`WalletLedgerList`.
- **Clubs** → custom `Club`/`Owner` vs Nakama **Groups**.
- **Tournaments** → custom `poker_tournament*` + `director.go` vs native **Tournaments**.
- **Storage** → raw SQL vs the storage engine + index.

**Completely untapped:** Leaderboards, Notifications, Chat channels, Streams/Status
(spectators), Friends, auth/session hooks, custom metrics, Satori live-ops, IAP.

### OddSlingers (reference)
Only UX *patterns* ported (deal animation, action timer, lobby cards, keyboard
shortcuts). Biggest rule-safe unused features: **table chat + dealer play-by-play,
sound, full chip-movement animations, hand-history replay UI, rich tournament
lobby, bet-sizing presets/slider, badges/achievements, side betting, bots**.

---

## Phased plan

Each phase ships something runnable and verifiable. Phases are ordered by value ÷ risk.

### ✅ Phase 1 — Real CFR / GTO solver (DONE)
The capability rs-poker was chosen for. Replaces the equity heuristic that
`gto_advise` admits is fake.
- `engine-math/src/lib.rs`: `cfr_advise()` drives `arena::cfr::CFRAgent` on the exact
  spot (known cards), bounded by `Deadline` + hard `NodeCount` cap so it always
  terminates. Returns action + `converged` flag (a truncated solve biases to fold,
  so low-confidence results are labeled).
- `engine-math/src/server.rs`: `POST /gto/solve`.
- `backend-core/poker/enginemath/gto.go`: `CfrSolve()` client (20s timeout — a real
  solve takes seconds).
- `backend-core/rpc/gto.go`: `GtoSolve` RPC, registered as `gto_solve` in `main.go`.
- Verified: top set vs air → call/raise (never fold); trash vs AA → fold. Test
  `cfr_solver_runs_bounded_and_decides` (cargo test, green).

Latency note: a full solve is ~3s at the node cap — an "analyze spot" action, not
per-decision live.

### ✅ Phase 1b — More rs_poker capabilities (DONE)
- `POST /outs` — `holdem::OutsCalculator`: exact (enumerated) equity + outs/draws.
- `POST /equity/range` — `holdem::RangeParser`: range-vs-range equity ("QQ+", "AKs").
- `POST /icm` — `simulated_icm::simulate_icm_tournament`: per-stack $ equity.
- 10 engine-math tests pass. Still open: mixed-strategy frequencies + `export_to_svg`
  tree visuals, `OpponentRanges` for CFR-vs-range.

### ✅ Phase 2 — Agentic MCP layer (BUILT; needs API key to run)
`mcp-coach/` — a TypeScript MCP server (`@modelcontextprotocol/sdk`) exposing:
- `analyze_spot` — calls engine-math (`/gto/solve`, `/equity`, `/gto/advise`) then has
  Claude (`claude-opus-4-8`) explain + flag mistakes. Grounded in the real engine —
  never invents math.
- `flag_bot` — Claude reasons over timing/sizing/frequency for bot-likelihood.
Builds clean (`npm run build`). Runtime needs `ANTHROPIC_API_KEY` + a reachable
engine-math. Next: wire from the frontend HUD and a Nakama `RegisterBeforeRt` hook.

### ✅ Phase 3 — Native Nakama + money-safety (DONE, this pass)
- **Wallet**: `Debit`/`Credit` now transactional + append-only ledger
  (`poker_wallet_ledger`), with a `wallet_ledger` RPC. Fixes the non-atomic,
  unledgered money path.
- **Authorization**: club/rake/balance RPCs now require an owner/configurer
  (`requireClubConfigurer`) — closes the broken-access-control hole (self-minting
  chips, adding yourself as owner, reading any ledger). `balance_get` is self-or-owner.
- **ID generator**: replaced the constant-seeded LCG (predictable, restart-colliding
  PKs, data race) with `crypto/rand`.
- **Leaderboards** (`social` pkg): native `global_winnings` board created on init,
  written on every hand settle.
- **Notifications**: hand-won, tournament-won/cashed, knockout via `NotificationSend`.
- **Full prize ladder**: real pool = entrants × buy-in; pays every prize tier by
  tracked `finish_place` (was: top place only, hardcoded pool).
Still open: clubs→Groups, custom tournaments→native Tournaments, storage engine,
chat channels, friends, streams/spectators.

### ✅ Phase 4 (partial) — OddSlingers UX (sound + bet presets DONE)
- **Sound**: `src/features/sound/` — Web-Audio-synthesized cues (deal/check/bet/call/
  fold/win/turn), mute toggle persisted, wired to existing opcodes. Zero assets/deps.
- **Bet-sizing**: ½/⅔/pot presets + slider, clamped to legal bounds, in `ActionBar`.
Frontend `npm run build` passes. Still open: table chat + play-by-play, chip-movement
animations, hand-history replay UI, rich tournament lobby.

### Phase 2 — Agentic MCP layer (live coach + anti-bot)
The "X-factor." Replace the heuristic `coaching/tip.go` and `antibot/score.go` with a
**Claude-backed MCP service**:
- Coach: real-time hand analysis / mistake alerts, grounded in the Phase-1 CFR solve
  and rs_poker equity (Claude explains, the engine computes).
- Anti-bot: an agent that reasons over timing/sizing/frequency patterns rather than a
  fixed statistical score.
- New service (Node/Go) exposing MCP tools that call engine-math; wire from
  `frontend-table` HUD and a Nakama `RegisterBeforeRt` hook for inline anti-bot.

### Phase 3 — Consolidate onto native Nakama (money-safety + features)
Highest-value backend cleanup; also fixes the wallet money-safety bugs.
- Wallet → `WalletUpdate`/`WalletLedgerList` (atomic, ledgered).
- Clubs → Groups; Tournaments → native Tournaments + `RegisterTournamentEnd/Reset`.
- Net-new, cheap: **Leaderboards** + **Notifications**.
- Add auth/session hooks (seed wallet + session vars on signup), custom metrics.

### Phase 4 — OddSlingers UX/feature ports (on Nakama + rs_poker)
Rule-safe, high polish. Order: table **chat + play-by-play** → **sound** → full
**chip-movement animations** → **hand-history replay UI** (data already persisted in
the audit chain) → rich **tournament lobby** → bet-sizing presets/slider →
badges/achievements → side betting.

### Phase 5 — Bots & new variants (engine work)
- **Bots**: Nakama-side bot presences using rs_poker `arena` agents / Phase-1 CFR for
  decisions; OddSlingers personalities as pure data. Fills tables, enables SNGs.
- **Omaha / Bounty** as *playable* variants: new Go match handlers driving rs_poker
  (which already evaluates Omaha) — not ports of OddSlingers' controllers.

### Phase 6 — OddSlingers on Railway (separate track)
Deploy OddSlingers itself (multi-service Django/Channels app) — see the separate
scoping needed: source strategy (upstream repo vs vendor vs submodule) and a prod
Dockerfile (its current one is dev-only, bind-mount based). Standalone service; not
the gameplay backend.

### Cross-cutting — transport
Current engine-math calls are HTTP REST. For live CFR/coaching, evaluate **gRPC or a
persistent connection** to cut per-call round-trips (the audits and the user's brief
both flag FFI/gRPC for latency).
