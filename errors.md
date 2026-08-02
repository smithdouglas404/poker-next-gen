# System-wide code review — findings

Full-system correctness review of `poker-next-gen`, run 2026-08-01 across nine
subsystems in parallel. Every finding below was traced through real code by a
reviewer that read the relevant files in full; nothing here is a style
preference or a speculative "could be cleaner" note.

**Nothing in this document has been fixed.** It is a triage backlog for later
review. Where a reviewer was genuinely uncertain whether something is a bug,
that uncertainty is recorded rather than hidden.

## Scope

| Subsystem | Files reviewed |
|---|---|
| Match / hand loop | `backend-core/match/holdem/` |
| Poker engine core | `backend-core/poker/` + `poker/enginemath/` |
| Money RPCs | `backend-core/rpc/{wallet,deposit,withdrawal,subscription*,rewards*,staking*,ledger*,bonus}.go` |
| Business RPCs | `backend-core/rpc/` (clubs, tournaments, admin, social, KYC, Clerk — 42 files) |
| Tournament lifecycle | `backend-core/match/tournament/` + tournament stores |
| Engine-math (Rust) | `engine-math/src/` |
| Frontend game/HUD | `frontend-table/src/features/{game,hud}/` |
| Frontend business UI | `frontend-table/src/features/{clubs,tournaments,wallet,marketplace,rewards,membership}/` |
| Frontend routes/auth | `frontend-table/middleware.ts`, `src/app/`, `src/features/profile/` |

## Severity counts

| Severity | Count |
|---|---|
| Critical | 7 |
| High | 11 |
| Medium | 10 |
| Low | 12 |

---

# CRITICAL

## C1. `OpAddChips` mints free chips at tournament tables

**`backend-core/match/holdem/handler.go:1323-1373`** (with
`handler.go:2469`, `reserveBuyIn`)

`reserveBuyIn` returns `("tournament", amount)` with **no wallet debit**
whenever `s.TournamentID != ""`. That shortcut is correct only for
`OpSitDown`, where the buy-in was already paid at tournament registration —
and the doc comment at `handler.go:2469` says exactly that. `OpAddChips` (the
"top up your stack from your wallet between hands" handler) calls
`reserveBuyIn(...)` with **no check on `s.TournamentID`**, unlike
`standUpBusted`, `evictExcluded`, `evictBannedOrKicked` and
`handleInsuranceAccept`, which all explicitly exclude tournaments.

**Failure scenario:** any seated player at a running tournament sends
`OpAddChips` between hands (`Phase == PhaseWaiting`, which recurs after every
settled hand). The wallet debit is skipped entirely, `seat.Stack += reserved`
mints chips from nothing, bounded only by `room := s.maxBuyIn() - seat.Stack`
— which for director-created tournament tables defaults to 3× the starting
stack (`match/tournament/director.go:472-482` never sets
`min_buy_in`/`max_buy_in`/`no_max_buyin`). Any player can triple their stack
for free, hand after hand. On a `NoMaxBuyIn` table the cap is skipped and the
mint is unbounded.

## C2. Free-tier stipend is withdrawable as real cash

**`backend-core/store/wallet.go:13-47`** + **`backend-core/rpc/withdrawal.go:21-99`**

Every wallet — including a never-subscribed free account and an anonymous
guest device account — is bootstrapped with a **$1,000** balance
(`GuestStipendCents`) that is never backed by a deposit and never posted to
the ledger (`WalletStore.Ensure`'s `INSERT … ON CONFLICT DO NOTHING` writes no
`poker_ledger_entry` rows, so it is invisible to `LedgerTrialBalance`). The
store package documents the safety assumption explicitly: *"free accounts
cannot deposit or withdraw, so the stipend is play money that can never become
or come from real funds."*

**That invariant is not enforced.** `WalletWithdraw` never checks subscription
tier for eligibility — only `requireRealMoney()` and
`requireVerified(kyc_aml)`, both tier-independent. It reads
`GetTierDef(tier).WithdrawLimitWeeklyCents`, which for `free` is `0` and
therefore falls back to `billing.LowestWithdrawWeeklyCents()` (Bronze's
$500/week) as a *velocity cap*, not a block.

**Failure scenario:** a brand-new free/guest account completes Didit KYC/AML
(itself ungated by tier) and withdraws up to $500/week of never-deposited
stipend, indefinitely, plus accrued daily bonuses and rakeback. The platform
pays out real money that was never put in. The only friction is KYC and the
human `WithdrawalApproveAdmin` review — nothing in code enforces the claimed
guarantee.

## C3. Finish-place assignment is a cross-table race → duplicate places → over-payment

**`backend-core/match/holdem/handler.go:2690-2691`**

```go
place, _ := ts.CountPlaying(ctx, s.TournamentID)
ok, _ := ts.Eliminate(ctx, s.TournamentID, seat.UserID, place)
```

Two separate round-trips under READ COMMITTED. The director runs one match
goroutine per table concurrently, so nothing prevents another table reading
the same count in the window between these calls.

**Failure scenario:** two players at two different tables bust in hands that
settle within the same few milliseconds (routine as the field narrows). Both
goroutines read `CountPlaying == 17`; both call `Eliminate(..., place=17)`;
both succeed (different `user_id` rows, no lock contention). Two players are
permanently recorded at finish place 17 and place 16 is never assigned.

Both payout paths (`director.go:230-268`, `rpc/tournament_ext.go:389-421`) pay
every finisher whose place falls inside a prize tier's `[RankFrom, RankTo]`. A
duplicated place landing in a richer tier while the skipped place lands in a
cheaper one makes total disbursement exceed the computed `PoolMinor` —
violating money conservation.

Note the contrast: `FinishOnce` (`store/wallet.go:558-570`) *is* correctly
race-safe (single `UPDATE … WHERE status<>'finished'` with a `RowsAffected`
check). That pattern was never applied to `Eliminate`. Ironically
`MarkBusted` (`store/wallet.go:445-455`) already contains the correct atomic
single-statement version — but it is dead code (see M6).

## C4. `pokerAward` silently destroys a winner's chips if their seat is vacated

**`backend-core/poker/sidepot.go:162-171`**

```go
if t.Seats[seat] == nil { continue }
```

A winner's `pay` (their pot share, possibly including the odd-chip remainder)
is dropped — not redistributed, not refunded. `showdown_async.go` exists
precisely so `winnersAmong`/`enginemath` calls can happen across an HTTP
round-trip (up to 2s) while the *live* `t.Seats` keeps mutating.
`winnersAmong`'s nil-guard (`sidepot.go:97-99`) validates only against the
frozen `ShowdownPlan.Seats` snapshot, not the live table `pokerAward` pays
into. `StandUp` (`table.go:282-286`) nils a seat with no check for money in
flight.

**Failure scenario:** a multi-way hand goes to showdown; during the network
round-trip a winning seat is removed (stand-up, kick, rebalance). Their share
vanishes — never paid, no other winner, no rake.

Not hypothetical: `handler.go:2119-2145` ("kick") and `:3356-3378`
("balance_table") contain detailed comments describing this exact
chip-destruction class and conceding their mitigations are **not** airtight
("reachable within a single tick if a kick and the action that resolves the
hand land in the same message batch, ahead of the `PhaseResolvingSidePots`
gate"). The root defect is that `pokerAward`/`ApplyResolutions` have no safe
failure mode other than silent drop; every caller must defend itself, and the
callers admit they haven't fully succeeded.

## C5. Mid-hand seating can produce a phantom winner

**`backend-core/poker/table.go:236-252`** (`sitDown`),
**`:971-987`** (`NonFoldedSeats` / `UncontestedWinner`)

`sitDown` has no check of `t.Street`/hand-in-progress before installing a seat
with `Status: SeatSeated`. `NonFoldedSeats`/`UncontestedWinner` only test
`Status != SeatFolded && != SeatEmpty` — never `TotalContributed`, never
whether the seat was dealt into the current hand.

**Failure scenario:** a seat is added mid-hand with `TotalContributed=0` and
not folded. If every other player folds, `AwardSidePots` →
`UncontestedWinner()` returns the brand-new seat and `pokerAward` pays it the
**entire pot** — never contributed a cent, never held cards.

Concretely reachable: the `"add_bot"` handler
(`handler.go:3390-3423`) calls `SitDownBot`/`SitDownBotUnlimited` with **no
phase/street check at all** — unlike the human sit-down path
(`handler.go:1112-1161`), which explicitly patches this gap by forcing
`seat.Status = poker.SeatFolded` when `s.Phase != poker.PhaseWaiting`. The bot
path skips that patch. Currently gated to non-real-money tables via
`if realMoneyEnabled() { break }` (`handler.go:3400-3402`), which limits
real-money blast radius — but the `poker` package provides zero protection and
the invariant is pure caller discipline, with one caller already found
non-compliant.

## C6. `sendAction` optimistically clears `actionRequired`, permanently hiding the ActionBar on a rejected action

**`frontend-table/src/features/game/GameProvider.tsx:510-517`**, with
**`hud/ActionBar.tsx:85`** and **`hud/HeroControlsDock.tsx:108`**

`sendAction` unconditionally calls `setActionRequired(null)` right after firing
`sendMatch(OpAction, ...)` — before any server confirmation. `ActionBar`
(`if (!isMyTurn || !actionRequired) return null;`) and `ExtendTimeButton` both
render only when `actionRequired` is non-null.

The backend can legitimately reject while `seatIdx == t.ActionSeat` (i.e. it
genuinely is still your turn): `"cannot check"`, `"raise too small"`,
`"raise below minimum"`, `"raise exceeds pot limit"`, `"unknown action"`
(`poker/table.go:743-832`). The handler only does `sendError(...); continue`
(`handler.go:1445-1447`) — it never re-broadcasts `OpActionRequired`. The
client's `case OpError:` (`GameProvider.tsx:298-301`) only sets `error`; it
never restores `actionRequired`.

**Failure scenario:** a rejected-but-still-your-turn action makes the entire
action UI vanish with no way to act again until the shot clock expires and the
server auto-folds. Real money lost to a forced timeout on a rejected raise.

## C7. `run_it_twice` panics on a board string containing any non-ASCII character

**`engine-math/src/lib.rs:227-236`** (reachable via `POST /run_it_twice`,
`server.rs:390-400,446`; `board` is a fully attacker-controlled JSON string)

```rust
if board.len() % 2 != 0 { return Err(...); }   // BYTE length
let chars: Vec<char> = board.chars().collect();
...
let s = chars[i + 1];                           // indexes by CHAR count
```

The dangling-card guard checks byte length for evenness; the loop indexes a
`Vec<char>`. For any string containing a multi-byte UTF-8 character the two
diverge, so an even byte length does not imply an even char count.

**Confirmed by standalone reproduction:** `"AsAhé"` is 6 bytes (passes the
check) but 5 chars — panics with `index out of bounds: the len is 5 but the
index is 5`.

`run_it_twice` is the all-in "run it twice" board-dealing path for real-money
pots. Tokio isolates the panic to the request/connection rather than
necessarily the process, but it is a 100%-reproducible crash on
attacker-controlled input on a real-money path.

---

# HIGH

## H1. `WalletWithdraw` omits the jurisdiction gate CLAUDE.md documents as mandatory

**`backend-core/rpc/withdrawal.go:21-99`**

CLAUDE.md: *"every money path (`rpc/deposit.go`, `rpc/withdrawal.go`) calls
`requireRealMoney()` + `guardJurisdiction()` + `requireVerified(…kyc_aml…)`
together."* `deposit.go` does call `guardJurisdiction(ctx, db)` (and
`blockedByRG`). `WalletWithdraw` calls only `requireRealMoney()` and
`requireVerified(...)` — `guardJurisdiction` is never invoked. A player whose
country is on the deny list (e.g. sanctioned after they funded) can still
receive a real-money withdrawal.

## H2. `WithdrawalApproveAdmin` pays out before atomically claiming → double real payout

**`backend-core/rpc/withdrawal.go:118-174`** (sequence at `:144-156`)

`payments.CreateNowPaymentsPayout(...)` — an irreversible external transfer —
runs *first*; only afterward does `wd.Approve(...)` atomically flip
`pending`→`paid`. There is no earlier atomic claim (contrast `FinishOnce`,
introduced in this same codebase to prevent exactly this class of double-pay).

**Two scenarios:** (1) two admins (or one double-click, or a retry) approve
the same withdrawal concurrently — both read `pending` via the unlocked
`GetByID`, both send a real crypto payout, only one `Approve` succeeds, so
accounting shows one payout while two were sent. (2) The payout succeeds but
`Approve` fails transiently — the row stays `pending` and a natural admin
retry sends a second real payout. No idempotency key ties the payout to the
withdrawal ID.

## H3. No socket disconnect detection or reconnect logic anywhere

**`frontend-table/src/features/game/GameProvider.tsx`** (whole file)

`wireSocket` (`:194-335`) only assigns `socket.onmatchdata`; it never overrides
`socket.ondisconnect`. The Nakama SDK's default `ondisconnect` is a no-op, and
the socket's heartbeat calls it on connectivity loss — so a drop is detectable,
but nothing listens. `connect()` (`:337-358`) is called exactly once from a
mount-time effect and never again anywhere in the frontend (no reconnect
button, no retry timer). `setConnected(true)` is the only call site for that
setter; it is never set back to `false`.

**Failure scenario:** on any WebSocket drop (mobile blip, LB idle timeout,
server restart) the UI keeps rendering the last-known `snapshot`/
`actionRequired` as if live, `connected` stays `true`, no rejoin is attempted.
The rendered table can silently disagree with server state indefinitely —
blinds progressed, hand advanced, other seats acted — with no indicator. Direct
violation of "state never drifts."

## H4. `TournamentStart` can restart a running or finished tournament

**`backend-core/rpc/tournament.go:349-390`**

`TournamentStart` validates blind levels and prize-tier totals but never checks
`bracket.Status`, and `tournament.StartTournament`
(`match/tournament/director.go:441`) has no guard either. It unconditionally
re-lists registered players, creates a brand-new set of table matches,
reassigns every player via `AssignPlayerTable` (overwriting assignments while
players are still seated at the now-orphaned tables), and creates a second
director match. `SetDirectorMatch` (`store/wallet.go:405-410`) then
unconditionally sets `status='running', current_level=1, level_started_at=NOW()`.

**Failure scenario:** an operator double-clicks "Start" (or two configurers
race, or `tournament_start` is called again on a finished event). Result:
duplicate table matches, players split across old and new tables, a leaked
director match, and a reset blind clock. No server-side guard at all.

## H5. Overlapping prize-tier rank ranges pay a finisher twice

**`backend-core/rpc/tournament.go:295-308`** (`PrizePoolAdd`),
**`:373-379`** (`TournamentStart`'s only structural check)

`PrizePoolAdd` inserts `{RankFrom, RankTo, PayoutBps}` with zero range
validation. `TournamentStart` checks only that `Σ PayoutBps == 10000` — never
that ranges are non-overlapping.

**Failure scenario:** tier A = ranks 1–3 @ 5000 bps, tier B = ranks 2–5 @ 5000
bps. Total is exactly 10000, so it's accepted. In the payout loop
(`director.go:232-244`, `rpc/tournament_ext.go:389-401`) a finisher at place 2
or 3 matches **both** tiers and `PayWinner` is called twice for them. Nothing
is idempotent against this — the store sees two legitimately-distinct calls.
Pays out more than `PoolMinor`, straight from house funds, no error surfaced.
Requires bad operator input, but there is no defense anywhere in the
create/validate/start pipeline.

## H6. `table_settings` silently clobbers the wallet cap and spectator policy

**`backend-core/match/holdem/handler.go:2153-2194`**

Every other field guards against an unset value (`if req.DecisionSecs > 0`,
`if req.BuyInMinCents > 0`, …) so omitting it leaves the current value
untouched. Two don't:
`if req.WalletLimitCents >= 0 { s.WalletLimitCents = req.WalletLimitCents }`
(`:2188`, true for essentially any payload) and
`s.AllowSpectators = req.SpectatorMode` (`:2191`, unconditional).

This would be harmless if callers sent a full current snapshot — but the only
callers (`features/table3d/TableAdminOverlay.tsx:365`,
`features/hud/HostPanel.tsx:141`) seed the form from static
`DEFAULT_TABLE_SETTINGS` (`walletLimitCents: 500_000_000`,
`spectatorMode: true`), never from the live snapshot.

**Failure scenario:** a host opens Table Settings only to change the turn timer
and saves. The request still carries `wallet_limit_cents: 500_000_000` and
`spectator_mode: true`, so a previously configured lower wallet cap — a
responsible-gaming/AML control per its own doc comment — silently jumps to
$5,000,000, and a table explicitly closed to spectators is silently reopened.

## H7. Straddle path can panic with index out of range

**`backend-core/poker/table.go:470-471`**

```go
utg := t.nextActiveSeat(bbSeat)
su := t.Seats[utg]
```

`nextActiveSeat` (`:712-721`) returns `-1` when no seat satisfies
`Status==SeatSeated && Stack>0`. Its only other caller (`advanceStreet`,
`:897-899`) correctly guards with `if t.ActionSeat < 0`. This block does not.

**Failure scenario:** `AllowStraddle && StraddleRequested` on a hand where
posting blinds exhausts every dealt-in player's stack (e.g. short-stacked
heads-up where SB and BB both post their entire remaining stack) — `t.Seats[-1]`
panics, crashing the match-loop goroutine mid-hand.

## H8. A player joining a heads-up table can never be dealt in

**`backend-core/poker/table.go:634-651`** (`assignButtonAndBlinds`, `len(active)==2`)

The heads-up branch hard-codes button/SB/BB to the two already-active seats and
never consults `nextBBSeat` (`:609-622`) — the function that in the 3+-handed
branch deliberately *includes* seats with `OwesPost=true` so a natural big
blind clears the debt. `activeSeats()` excludes `OwesPost` seats, so while
exactly two others remain active, a joiner's `OwesPost` is **never** cleared —
they sit out every hand indefinitely unless the client set `PostNow=true` at
sit-down. Their buy-in is frozen at the table.

Test coverage corroborates: `blinds_test.go`'s `TestNewJoinerNotDealtFree`
covers the 3-handed case only; there is no heads-up equivalent.

## H9. `showdown_winners` never validates that different players' hole cards collide

**`engine-math/src/lib.rs:63-83`** and **`:300-320`**

`rank_hand`/`rank_omaha` build one `Hand`/`OmahaHand` per player, and
`Hand::new_from_str` only rejects duplicates *within a single string*. Nothing
checks that player A's hole cards don't reuse a card held by player B.

**Failure scenario:** a bug or manipulated payload in `backend-core` sends
`holes=["AsKh","AsQd"]` to `/showdown`. Engine-math — the sole authority for
showdown resolution per golden rule 4 — returns a winner for a physically
impossible deal instead of erroring, and that result moves real money. Note
`range_equity` (`lib.rs:757-769`) *does* do this check correctly (`used.contains(c)`),
so the fix pattern already exists in the file.

## H10. Session-bridge failure silently authenticates as a fresh anonymous account

**`frontend-table/src/lib/nakama/auth.ts:100-106`** (`ensureSession`), via
`lib/nakama/sessionRpc.ts:6-8`, with `features/auth/ClerkNakamaBridge.tsx:47-50`

`ensureSession()` is: use the persisted Nakama session if valid, **otherwise
silently `authenticate("device", {}, true)`** — minting and persisting a brand
new anonymous account. `ClerkNakamaBridge` is what's supposed to populate that
session by trading the Clerk JWT for a real `clerk:<sub>` session, but its
`catch` just resets `attempted.current = false` and gives up — no error
surfaced, nothing blocked.

**Failure scenario:** user has a valid Clerk session, lands on `/profile`, the
bridge call fails transiently. Any component calling `callSessionRpc` triggers
`ensureSession()`, which finds no persisted session, creates a fresh anonymous
device account, and calls `profile_get`/`wallet_get` against it. The RPCs
*succeed*, so no error path fires; the user sees a real-looking but wrong
identity (empty wallet, no history) with no indication anything is wrong. No
privilege escalation (backend treats it as a genuine guest), but it masks
outages as "your account is empty" and leaves stray accounts behind.

## H11. Fabricated balances and stats shown as real on the profile

**`frontend-table/src/features/profile/ProfileOverview.tsx:291-294`**,
**`SecurityDashboard.tsx:226`**

```ts
const chips = wallet?.balance_cents ?? profile?.balance_cents ?? 5_000_000;
const hands = stats?.hands ?? 25_000;
const winPct = stats ? Math.round(stats.win_rate_pct) : 65;
```

`wallet_get`/`player_stats` are separate `Promise.allSettled` branches
(`:244-259`); only `profile_get` failing triggers the "Showing demo profile"
toast. A `wallet_get` failure alone leaves the Chip Balance card showing
**"$50.0k"** and 65% / 25,000 hands as if real, with no label anywhere —
unlike `RevenueReports.tsx:184-192`, which correctly blanks financial fields on
failure. Directly contradicts "the display reflects server truth or it shows
nothing" for a real-money balance.

Secondary in the same file: `DEMO_TRANSACTIONS` (`:168-170`) and
`DEMO_ACHIEVEMENTS` (`:172`) persist unlabeled if `wallet_ledger`/`loyalty_get`
throw, showing invented rows like "Cash-Out +$50,000" and "Credit Limit
Updated $100,000" as real.

## H12. Live tournaments show a fabricated blind ladder

**`frontend-table/src/app/tournaments/page.tsx:185`**

`levels: levels.length > 0 ? levels : DEMO_BLINDS` sits in the **non-demo**
branch (the `demo` early-return is at `:168-171`). The `demo` prop passed to
`FocusRail` is `false`, so the "Demo structure · offline" disclaimer never
renders.

**Failure scenario:** an operator starts a tournament before populating blind
levels (or `blind_level_add` partially fails — the file's own `onPublish`
comment admits it's "best-effort… even if a level/tier fails"). Every player
sees a confident, wrong blind schedule (Level 1: 500/1000 → Level 6:
5000/10000) with no indication it's fake.

## H13. Owner Hub shows invented tables and tournaments as real

**`frontend-table/src/features/clubs/owner/OwnerHub.tsx:741-781, 813-823`**
(`DerivedSection`) and **`Overview.tsx:325-368`** (`UpcomingTournaments`)

Both fall back to hardcoded rows ("Gold Cup Championship", "Diamond Vault
Turbo", "High Stakes — Table 1 · $500/$1k", "Nightly PLO — Table 3") when the
`table_list`/`tournament_list` RPC fails **or simply returns empty**. Neither
component takes a `demo` prop, so they render identically in live and demo
mode.

Internally inconsistent: `FeaturedTables` in the *same file* as
`UpcomingTournaments` (`Overview.tsx:237-279`) correctly gates its demo
fallback behind an explicit `demo` prop. A real club owner with a legitimately
quiet network sees invented table names and pot values as real.

---

# MEDIUM

## M1. `ClubEventList` has no authorization check

**`backend-core/rpc/clubs_ext.go:980-994`**

Every sibling read in the same file (`ClubRoster`, `ClubQuickStats`,
`ClubAnnouncementList`, `ClubMemberStats`) was explicitly patched to require
`requireClubReader`/`requireClubConfigurer` — with inline comments noting this
exact bug pattern ("this had no auth check at all"). `ClubEventList` never
calls `callerID` or any membership check before
`ClubExtStore.ListEvents(ctx, req.ClubID, req.Limit)`, which itself is a plain
`SELECT … WHERE club_id=$1`.

Any caller who knows or guesses a `club_id` (IDs are returned in several
public-ish contexts, e.g. `ClubList`) can pull a private club's full event
schedule — names, times, blinds, format.

## M2. First-ever daily-bonus claim can be multi-credited

**`backend-core/store/bonus.go:37-98`** (`DailyBonusStore.Claim`)

The eligibility check does `SELECT … FOR UPDATE` on
`poker_daily_bonus WHERE user_id=$1`. For a user's first claim there is no row,
so `sql.ErrNoRows` returns and **nothing is locked**. Two concurrent claims
(double-click, two tabs) both observe "never claimed" before either commits and
both credit the wallet; the `INSERT … ON CONFLICT DO UPDATE` serializes only the
bookkeeping row, not the eligibility decision already made.

Bounded by `DailyBonusChips` per extra concurrent request ($5–$100 by tier), so
impact is limited — but it is a genuine race, distinct from every other
credit/debit path here (which all correctly guard with
`WHERE balance>=$2` / `WHERE status=...`).

## M3. Buy-in band `$100–$1,000` silently overrides a table's configured limits

**`backend-core/match/holdem/handler.go:937-942`** (`OpSitDown`) +
**`:2468`** (`reserveBuyIn`)

After clamping to the table's own configured band, the code applies
`poker.ClampBuyIn(buyIn)` unconditionally for any non-`NoMaxBuyIn` table,
re-clamping to `[$100, $1,000]` — undoing the table-band clamp applied a few
lines above for any table configured above $1,000. Real-money tables can never
opt into `NoMaxBuyIn`, so this applies to every real-money table with a
higher buy-in. `reserveBuyIn` applies the same band independently, so
auto-buy-back inherits the ceiling too.

**Ambiguous — flagged rather than resolved.** `poker/buyin_test.go`'s comments
("ClampBuyIn is the capped-table default and must never let anything through
above MaxBuyInCents") suggest the $1,000 ceiling is deliberate — but that
conflicts with host-configurable `min_buy_in`/`max_buy_in`
(`rpc/table.go:39-49`) being fully wired through with no validation rejecting
values above $1,000. Either way the user-visible effect is real: a table
configured for deep stacks silently seats everyone at exactly $1,000.

## M4. Blind-level desync — `MatchSignal` failures silently discarded

**`backend-core/match/tournament/director.go:110-122`** (`tickClock`),
**`:130-152`** (`signalBreak`/`signalBlinds`)

`tickClock` persists the new level (`AdvanceLevel`) and broadcasts it
(`broadcastInfo`) regardless of whether each table received it —
`signalBlinds`/`signalBreak` do `_, _ = nk.MatchSignal(...)`, discarding the
error entirely (`:137`, `:150-151`). The receiver only updates
`s.SmallBlind`/`s.BigBlind` when the signal is actually processed
(`handler.go:3338-3354`).

**Failure scenario:** a transient `MatchSignal` failure to one table leaves it
playing the old, smaller blinds indefinitely while the DB and spectator UI say
otherwise. There is no periodic re-sync — each level transition is one-shot
fire-and-forget, so every subsequent level compounds the drift for that table.

## M5. Terminal status mismatch (`'eliminated'` vs `'busted'`) — `MarkBusted` is dead code

**`backend-core/store/wallet.go:445-455`** vs **`:468-478`**; consumers at
**`store/tournament_ext.go:261-284, 293-318`**

`processTournamentEliminations` → `ts.Eliminate` runs first and sets
`status='eliminated'`. `reportTournamentBusts` → `ts.MarkBusted` runs after in
the same sequence, but its `WHERE status='playing'` guard can no longer match —
so **`MarkBusted` never fires in real tournament play.**

Consequences: `Eliminations` (the `TournamentStatus` RPC's "recent
eliminations" feed) always returns empty; `ChipStandings` never sorts
eliminated players to the bottom, and shows a **stale non-zero `stack`** for
them because `Eliminate` (unlike `MarkBusted`) never zeroes the column.

Not a fund-movement bug (payouts depend only on `finish_place`, which
`Eliminate` does set), but it means the atomic place computation embedded in
`MarkBusted` — the safer alternative for C3 — exists but is never exercised.

## M6. `OpTableMoved` doesn't coordinate with in-flight actions

**`frontend-table/src/features/game/GameProvider.tsx:302-328`**

On `OpTableMoved` the handler fires an unawaited
`leaveMatch(old)` → `joinRoom(new)` sequence. Any `sendAction`/`sendMatch`
already in flight targets the `matchId` captured in its closure — it can land
after `leaveMatch`, or after `matchId` flipped, with no retry against the new
match and no indication the action was lost. Narrow window (multi-table
rebalancing only), but nothing guards it.

## M7. Marketplace shows demo avatars as real stock

**`frontend-table/src/features/marketplace/AvatarTiers.tsx:36-44`**,
**`PremiumMarket.tsx:32-35`**

Both fall back to hardcoded catalogs (`DEMO_PREMIUM_AVATARS`,
`DEMO_BASIC_AVATARS`, `DEMO_EXCLUSIVE_AVATARS`) whenever the live
`cosmetic_list` has no items in that price/rarity bucket. Neither renders a
"Demo" badge — a real user sees "Cyber-Knight X1 — $500.00 — Purchase"
indistinguishable from real inventory.

The purchase path itself is safe (`app/marketplace/page.tsx:191-220` checks
`isDemoCosmeticId()` and discloses "offline demo — not a live purchase" *after*
the click), and `checkout/page.tsx` correctly discards its analogous
`DEMO_CART`. But the browsing surface misrepresents fake products as real
before that point, and the "ownership" granted lives only in unpersisted React
state.

## M8. Revenue sparklines are synthetic rescalings of unrelated data

**`frontend-table/src/features/clubs/owner/RevenueReports.tsx:280-283`**

Three of four KPI sparklines ("Net Profit", "Rake Collected", "Tournament
Fees") are the real rake series arbitrarily rescaled
(`seriesVals.map(v => v * 0.7)`, `* 0.6`, `* (0.2 + (i%5)*0.05)`). The headline
values are computed correctly from real data, but the trend *shapes* are
invented and could show a rising or falling profit trend that never happened —
the same "a chart is a claim about history" concern this file's own comments
raise elsewhere (`:164-165`, `:188-191`), just not applied here.

## M9. `SecurityDashboard`'s "Active Sessions" panel is entirely fabricated

**`frontend-table/src/features/profile/SecurityDashboard.tsx:104-106`**

```ts
const sessions: ActiveSession[] = DEMO_SESSIONS;
```

Unlike `linked` (replaced by real `wallet_linked_list` data at `:121-157`),
`sessions` is never reassigned anywhere — permanently the hardcoded
"Chrome · macOS · Las Vegas, US" / "iOS App · iPhone 15" / "Safari · iPad ·
Reno, US" (`profileRpc.ts:307-311`), rendered under "Active Sessions" with a
"Revoke" affordance and no demo indicator. This is a security surface: a user
checking for account compromise is either falsely reassured or needlessly
alarmed. No bypass (the "Revoke" link just routes to `/profile/security`).

## M10. Engine-math has no upper bound on card count

**`engine-math/src/lib.rs:22-28`**

`rank_hand` checks `hand.count() < 5` but never `> 7`. `rs_poker`'s evaluator
(`SevenCardAccum::rank`) supports at most 7 cards and guards only with a
`debug_assert!` — compiled out in release. All table lookups are power-of-two
masked, so over-7-card input never panics; it silently returns what the crate's
docs call "a meaningless score."

`estimate_equity`/`gto_advise` are safe (they route through
`MonteCarloGame::new`, which rejects `hand_size > 7`), but
`rank_hand`/`compare_hands`/`batch_rank`/`showdown_winners` call `hand.rank()`
directly with no guard. A 6+-card board, or 4-card Omaha holes accidentally
routed to `/showdown`, produces a bogus rank instead of a validation error — on
the same real-money settlement path as H9.

---

# LOW

## L1. Advisory engine-math endpoints share H9's missing duplicate validation
**`engine-math/src/lib.rs:49-60, 322-380, 626-685, 438-589`** —
`estimate_equity`, `gto_advise`, `outs`, `cfr_advise` never check hero/villain
card overlap. `MonteCarloGame::new` and `OutsCalculator::try_new` build their
remaining-cards bitset by insertion, which silently no-ops on duplicates. These
are analysis endpoints (equity, GTO Trainer, coaching tips), not settlement, so
severity is lower — but it's the same root cause.

## L2. Modulo bias in `shuffle_with_seed`
**`engine-math/src/lib.rs:139-166`** — `j = (w as usize) % (i + 1)` is textbook
modulo bias. For n ≤ 52 the skew is ~1.2×10⁻⁸ — not practically exploitable,
and the Fisher-Yates structure itself is correct with no off-by-one. Flagged
only because the module markets itself as "provably fair"; rejection sampling
would be the purist fix. Everything else in the commit-reveal scheme checks out
(OsRng seed, same shuffle fn for commit and reveal, locked reference vector).

## L3. Insurance premiums not refunded when showdown resolution fails
**`backend-core/match/holdem/handler.go:1900-1930`** — the `res.Err != nil`
branch refunds pot chips and resets the table but never touches
`s.Insurance`/`s.InsOffered` or calls `settleInsurance`. A player who paid a
premium (debited from wallet at `:1827-1856`) loses it permanently with no
policy resolution, even though the hand never completed. Narrow trigger
(engine-math must fail between an accepted offer and showdown), but a real
uncompensated loss of real funds.

## L4. `accrueLoyalty` skips players who disconnect before settlement
**`backend-core/match/holdem/handler.go:2786-2788`** — the doc comment says HRP
goes to "every human who played this hand… losers still progress," but the loop
guards on `s.Presences[seat.UserID]`. A player auto-folded by
`enforceActionDeadline` (which doesn't require presence) whose socket drops
before settlement is fully counted in `attributeHand` stats but silently skipped
for HRP, avatar battle record, missions, and achievements. Real code/comment
mismatch; whether it's a bug depends on whether the presence check is
intentional anti-abuse — no comment explains it.

## L5. Failed auto-action at the deadline leaves the clock armed
**`backend-core/match/holdem/handler.go:1498-1533`** — if
`ApplyAction(seatIdx, action, 0)` errors at deadline, the function returns
without resetting `ActionDeadlineTick`/`ActionDeadlineSeat`, so it would retry
the identical failing call every tick indefinitely — no fold forced, no error
surfaced. No concrete reachable scenario found (the seat is already confirmed
`ActionSeat` with `Status == SeatSeated`), so likely a defensive gap rather
than a live bug.

## L6. `BuildSidePots` can drop a contribution band with an empty eligible list
**`backend-core/poker/sidepot.go:52`** — `if layer > 0 && len(eligible) > 0`;
if a band ever has zero non-folded contributors its chips are never paid or
refunded. Traced carefully and could not construct a reachable sequence: the
single overall maximum contributor is always non-folded by induction, so every
threshold has an active seat. Flagged as a defensive gap (no error/log if a
future bomb-pot/straddle/rebuy interaction breaks the invariant) rather than a
proven bug. **Genuinely uncertain.**

## L7. `DeductRakeFromWinners` mis-tracks per-seat gross on uneven splits
**`backend-core/poker/showdown_async.go:252`** — `share := r.Amount / len(r.Winners)`
(floor) builds the `won[]` map for proportional rake, but the actual payout
gives the odd chip to one winner via `oddChipOrder`. Rake splits slightly off
(≤1 chip per layer per winner). Total rake still exact via the mop-up loop
(`:279-296`) — **except** if every winner's stack is drained by earlier
deductions (`best < 0` breaks the loop), where the shortfall is silently never
collected. Uncollected house revenue, not player-fund destruction; requires
rake approaching winnings.

## L8. `attributeHand` rake-net disagrees with actual stack delta
**`backend-core/match/holdem/handler.go:112-116`** — computes
`won - rakeAmount*won/grossWon` (fresh proportional division) while the real
movement uses per-seat truncation with the remainder to the largest winner. So
`poker_hand_stats.net_cents` can differ by a cent or two on multi-way pots.
Analytics-only; no chips move through this path.

## L9. `ReferralClaim` can permanently lose a reward on credit failure
**`backend-core/rpc/missions.go:525-553`** — `rs.ClaimAll` flips every
qualified row to "claimed" up front, but the credit loop only `logger.Error`s
and `continue`s on failure — no retry, no revert, no per-item error. The
response still returns `"ok":true` with the full `claimed_count` while
`total_cents` silently reflects fewer dollars. The referral is permanently
`claimed` with no credit, traceable only in a server log. Unlike
`MissionClaim`/`BattlePassClaim`, the failure doesn't abort or refund.
Possibly an accepted trade-off matching patterns elsewhere — flagged with
moderate confidence.

## L10. Prize-ladder integer division silently loses fractional units
**`backend-core/match/tournament/director.go:237`**,
**`rpc/tournament_ext.go:394`** — `pool * bps / 10000 / places` floors twice.
The remainder (≤ `places-1` minor units per tier) is never credited, rolled
over, or logged. Conservation direction is safe (under-pays, never over-pays),
but the remainder truly vanishes. Worth a comment or largest-remainder
distribution if audits ever need precision.

## L11. `PrizeDistributionPool.GuaranteedMinor` is stored but never applied
`models/tournament.go`'s `GuaranteedMinor` is populated by `AddPrizeTier` and
scanned by `ListPrizes`, but neither payout implementation reads it — only
`PayoutBps` drives the math. Not a conservation bug, but a configured per-place
guarantee silently has zero effect, which could mislead an operator.

## L12. Frontend protocol gaps and small client-side leaks

- **`OpInsuranceOffer` (113) is never handled.** The backend sends a real
  `InsuranceOfferMessage` to the all-in player whenever `AllowInsurance` is on
  (`handler.go:1809-1821`), but `protocol.ts` declares neither opcode 113 nor
  104/107/109/110, so it falls into `default: break`. No client type, no UI, no
  `OpInsuranceAccept` wrapper — a live backend feature with zero working UI.
  *(Arguably High: it's a real table capability that silently does nothing.)*
- **`preAction` is a module-level global, not match-scoped**
  (`features/hud/preAction.ts`) — never reset on `joinRoom`/`standUp`/`sitDown`,
  so a "Check/Fold" armed at table A survives to table B and can auto-fire on
  the first turn there.
- **`case OpError` dereferences a possibly-null payload**
  (`GameProvider.tsx:298-301`) — `payload` is `null` when `md.data` is falsy;
  an `OpError` frame with an empty body throws. No current server call site
  sends an empty body, but it's unguarded in the handler most likely to run
  during degraded states.
- **`EmoteBubble`'s 2500ms removal timer isn't cancelled on unmount**
  (`features/hrc/components/EmoteSystem.tsx:52-63`) — only the listener
  subscription is cleaned up. Harmless in React 18, but a real uncancelled timer.
- **`ClubNights.tsx:24-30, 108-149`** — small blind, big blind, and buy-in
  inputs have no `min` attribute (only `seats` does) and `create()` validates
  only that the name is non-empty; zero/negative values can be submitted to
  `club_schedule_create`. *Backend re-validation not verified — confirm it.*
- **`walletConnect.ts:53-59`** — Phantom (Solana-only) has
  `payoutCurrency: "ltc"`, and the withdraw-currency select offers no `sol`
  option at all. Looks like a copy/paste default; not confirmed as functional
  (the payout rail may be intentionally decoupled from the connected chain).
  **Low confidence.**

## L13. Middleware's guest surface drifts from its own comment and from CLAUDE.md
**`frontend-table/src/middleware.ts:5-21`** — the comment says the guest path
includes "the table-code entry (`/clubs/join`)", but `/clubs/join` is **not** in
`isPublicRoute`, so guests can't reach it. Separately, the actual public surface
(`/lobby`, `/diag`, `/capabilities`, `/proof`, `/provably-fair`) is wider than
CLAUDE.md's stated policy ("guests may reach ONLY the table-code path +
`/table`"); `/lobby` renders club lists and tournament teasers to unauthenticated
visitors. No sensitive per-user data leaks (all degrade to empty/locked states),
so not exploitable — but code, comment, and binding policy disagree three ways.

## L14. `/admin` uses a bespoke client gate instead of shared `RequireRole`
**`frontend-table/src/app/admin/page.tsx:43-57`** implements its own
`gate`/`adminApi.roles()` check rather than reusing `features/auth/RequireRole.tsx`
(which `command-core` and `cyber-deck` use). Functionally equivalent — both fail
closed — but the duplication is worth consolidating.

---

# Cross-cutting themes

**1. The "helper with implicit assumptions, misused by a caller" pattern.**
This is the single most productive bug class in this codebase. C1
(`reserveBuyIn`'s tournament shortcut reused by `OpAddChips`) and the
already-fixed win-streak bug (`Award` reused for a non-hand bonus credit) are
the same shape: a function whose contract holds for its original caller,
silently violated by a second caller added later. **Recommended:** audit
remaining multi-caller helpers in `store/` and `match/holdem/` for the same
shape.

**2. Atomic compare-and-set applied inconsistently.** `FinishOnce`
(`store/wallet.go:558-570`) is a textbook-correct atomic claim, and the
codebase clearly knows the pattern. But `Eliminate` (C3), `DailyBonusStore.Claim`
(M2), and `WithdrawalApproveAdmin` (H2) all use read-then-write instead. Worth a
systematic pass for `SELECT`-then-`UPDATE` pairs on money or ranking state.

**3. Demo-data fallbacks that aren't gated on demo mode.** The codebase has a
well-established, explicitly-commented convention (`?demo=1`/`?preview=1`
gating, "Demo structure · offline" labels) — see `clubs/owner/demoData.ts`,
`tournaments/demo.ts`, `membership/previewTiers.ts`. H11, H12, H13, M7, M9 are
all places that convention lapsed, several of them *in the same file* as a
sibling component that does it correctly.

**4. Async showdown vs. live table mutation.** C4 and C5 are two faces of the
same structural gap: `ShowdownPlan` freezes a snapshot for the engine-math
round-trip, but `ApplyResolutions`/`pokerAward` write back into a table that may
have changed. The callers know (`handler.go:2119-2145`, `:3356-3378` have long
comments about it) and concede their mitigations are incomplete. This probably
needs a structural fix in `poker/` — a safe failure mode for "winner seat gone"
— rather than more caller-side patches.

**5. Input validation missing at the trust boundary.** H9, M10, L1, C7 are all
engine-math accepting physically-impossible or malformed input rather than
rejecting it. This is the *last* line of defense for money movement per golden
rule 4; it should be the strictest, not the most permissive.

---

# Verified clean (checked, no issues found)

Recorded so a future pass doesn't redo the work:

- **Money store layer.** All debit/credit paths use single-transaction
  `UPDATE … WHERE balance>=$2 RETURNING` guards (atomic check-and-act) and pair
  every movement with a balanced double-entry ledger posting (`postLedgerKind`/
  `PostTx`, which rejects unbalanced postings). `DepositStore.MarkCredited`,
  `WithdrawalStore.Approve`/`Reject` are correctly idempotent.
  `MarketplaceStore.Buy` takes `FOR UPDATE` on the listing and re-verifies both
  parties' inventory. `PurchaseCosmeticAtomic`, `RedeemRewardAtomic`,
  `RakebackStore.Claim`, and the staking escrow ordering are all atomic.
- **Caller identity.** Every money RPC derives the acting user from
  `callerID(ctx)`/`RUNTIME_CTX_USER_ID` — never a client-supplied `user_id`.
  Admin RPCs taking a target `user_id` are gated by `isAdmin(callerID)`.
- **Webhook signatures.** Stripe uses constant-time HMAC with a timestamp
  window; NOWPayments IPN uses HMAC-SHA512 with `hmac.Equal`. *(Stripe lacks
  event-ID replay dedupe, but `grant()` computes expiry from `time.Now()`
  rather than compounding, so retries reset rather than stack — noted, not
  exploitable for gain.)*
- **Business RPC authorization.** Nearly all mutating club/tournament/admin
  RPCs derive the caller's role server-side via `requireClubConfigurer`/
  `requireClubPermission`/`clubsextRequireOwner`/`isAdmin` rather than trusting
  the payload; several files contain explicit prior fixes for exactly the bug
  classes reviewed. M1 is the one remaining instance.
- **Seat index consistency.** `Seat.Index` is kept in sync with array position
  at every mutation site (`SitDown`, `SeatTransferIn`, `MoveSeat`);
  `ShowdownPlan.Seats`, `PotResolution.Winners`, `winBySeat`/`winnerSeatSet`,
  and `winners[seat.Index]` are all consistently raw-array-indexed. No
  divergence found.
- **Match-state concurrency.** Exactly one goroutine touches match state
  (`StartShowdownAsync`), and it operates only on an immutable `ShowdownPlan`,
  delivering results over a channel drained synchronously inside `MatchLoop`.
  No unsynchronized concurrent access.
- **Side-pot eligibility.** Folded contributors are correctly excluded from
  every pot layer including ones they funded — this matches standard poker
  rules and would be a bug the other way.
- **Run-it-twice arithmetic is exact.** `base + remainder-to-earliest-boards`
  sums back to `pot.Amount` for N=2,3,4 and non-divisible amounts.
- **Omaha 2-of-4 + 3-of-5 is correctly enforced** by `rs_poker::omaha::OmahaHand`
  (verified in the vendored crate source plus its own tests). Holes and board
  are always sent as *separate* fields from Go — no concatenation shortcut that
  could blur variants.
- **No local math fallback anywhere** in `poker/enginemath/*.go`. Every RPC
  returns an error on transport failure or non-200 with zero local evaluation.
  `NewDeck`/`StartHand` bail out before mutating hand state if the shuffle call
  fails.
- **Table merge/break seat transfers** are solid and well-commented: the source
  only stands a player up after the destination durably commits, busted seats
  are excluded from in-flight transfers, and a table is pruned only once
  confirmed empty. No stack-loss/duplication/limbo bug found.
- **`FinishOnce` is genuinely race-safe** (single atomic compare-and-set).
- **`BountyStore.Claim`** is a proper atomic `UPDATE … WHERE active=TRUE RETURNING`.
  No re-entry feature exists, so stale-elimination-on-re-entry can't occur.
- **Turn-nonce coverage is correct.** `sendAction` attaches it (matching backend
  dedup); `sendTaunt`/`sendEmote`/`hostAction`/`addChips` correctly omit it (not
  turn-gated); `useTimeBank` omits it safely (backend is structurally idempotent).
- **No stale closures in the socket handler** — `onmatchdata` uses functional
  `setState` throughout.
- **`ChatMessage.kind` union and `TableSnapshot.board`/`.seats` non-optionality**
  both match what the backend actually sends.
- **Frontend out-of-order response guarding** — `cancelled` flags are used
  consistently across ~15 club/owner components, all of `wallet/`,
  `rewards/RewardsMarketplace.tsx`, and `membership/`.
- **No dead buttons found** in the business-feature UI; all client-side
  permission gates are explicitly commented as also server-enforced.

---

# Caveats

- Every finding was traced by reading source; none were reproduced against a
  running stack **except C7**, which was confirmed with a standalone Rust
  repro.
- The frontend reviewers could not verify backend enforcement for
  client-side-only gates (noted inline where relevant, chiefly L12's
  `ClubNights` validation and the admin-console RPCs behind `/admin`,
  `command-core`, `cyber-deck`). Those need a targeted backend pass.
- M3 (buy-in band) and L6 (empty side-pot band) carry genuine uncertainty about
  whether they are bugs at all — the evidence is contradictory and is recorded
  as such rather than resolved.
