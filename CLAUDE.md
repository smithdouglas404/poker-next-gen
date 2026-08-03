# CLAUDE.md

Guidance for AI coding agents (Claude, Devin, etc.) working in this repository.

## What this repo is

`poker-next-gen` is a monorepo for a Texas Hold'em poker network. It deploys on
**Railway** via `.railway/railway.ts` (Infrastructure as Code). Docker Compose
is optional legacy for offline local dev only — see `docs/DOCKER.md`.

Three first-class services live in their own top-level directories:

- `frontend-table/` — Next.js 15 (App Router, TypeScript, Tailwind) + Pixi.js v8.
- `backend-core/` — Go module compiled as a Nakama runtime **plugin**.
- `engine-math/` — Rust library wrapping `rs_poker`.
- `oddslingers/` — git submodule for reference; not deployed on Railway yet.
- `ai-host/` — Python Pipecat Cloud agent (optional, per-table AI voice/text
  host). **Not deployed on Railway** — it's a separate agent image pushed to
  Pipecat Cloud via `pipecat cloud deploy` (see `ai-host/pcc-deploy.toml`), started/
  stopped by `backend-core/integrations/pipecat.go` against a table's own
  Daily.co room. Off by default per table (`rpc/ai_host.go` `ai_host_toggle`).
  Talks to `backend-core` outbound-only over Nakama's HTTP RPC endpoint
  (`ai_host_narration_poll` / `ai_host_chat_post`) — never handed hole cards,
  a real player session, or the solver RPCs (`hand_rank`/`equity_estimate`/
  `gto_advise`/`gto_solve`/`coaching_tip`); its only game-state input is the
  same public `narrate()` text every spectator already sees.

## Golden rules

1. **Do not change pinned versions casually.** The `backend-core` plugin only
   loads into a Nakama server built from the *same* `nakama-common` version.
   The pairing is pinned to **Nakama 3.31.0 ⇄ nakama-common v1.41.0** in both
   `backend-core/go.mod` and `backend-core/Dockerfile`. Bump them together.
2. **Railway is the primary run target.** Production and recommended dev =
   `.railway/railway.ts` (`railway config apply`). Optional local Docker =
   `docker-compose.yml`. Keep build/start behavior aligned when both paths exist.
3. **Frontend rendering is client-only.** `src/app/table/page.tsx` is `"use client"`
   and mounts `HrcTable` via `dynamic(..., { ssr: false })`. The table itself is
   DOM + framer-motion (see DESIGN-SYSTEM). Pixi.js (`features/table/*`) and
   three/R3F (3D avatars only) touch WebGPU/WebGL and must never be imported
   during SSR.
4. **No math fallbacks.** Shuffle, hand rank, showdown, and equity always go
   through `engine-math` (rs_poker). If the sidecar is down, operations fail —
   the Go backend must not silently use local eval or `crypto/rand` shuffles.

## DESIGN-SYSTEM — the guaranteed look (BINDING)

This section is the contract for **all** UI. It is not aspirational styling advice — it is the definition of "done" for anything a player sees. Deviating from these values is a defect, not a preference.

**The reference is the running app, not a mock-up.** Open `/table` (or `/table?demo=1`, which drives the identical renderer off `DEMO_SNAPSHOT` with no backend) and match it. There is no `/proof` route and no separate showcase to compare against — if a document, comment or commit message tells you to "match the proof", it is stale and you should fix it.

> **Read this before touching the table.** This file used to describe the table
> as a React Three Fiber cinematic scene, anchored to a `src/app/proof/`
> directory that had been deleted. Meanwhile `/table` hard-pinned the flat 2.5D
> renderer, so the "binding" design contract described something the app never
> rendered. That single inconsistency cost a full day: the table was rebuilt,
> reverted, and rebuilt again while agent and owner meant different things by
> "the table". The 3D table and every switch that selected it are now deleted.
> **There is exactly one table renderer.** Keep it that way, and keep this
> section true to what actually runs.

### Palette — GGPoker (dark slate / red / green / gold)

The theme is **GGPoker**, applied globally to **every** screen via the shared tokens
(this is the winning bake-off look, locked in commit `9fb6f04` "apply GGPoker global
theme across all screens" + the follow-up sweeps). It is **dark-only by design** — do
not add a light mode. These are the ACTUAL, canonical values in
`frontend-table/src/app/globals.css` (`:root` + `@theme inline`) — this table mirrors
the code, not an aspiration. Reference them through the Tailwind theme
(`bg-background`, `bg-surface`, `text-foreground`, `text-brand`, `text-green`,
`text-gold`, `font-display`, `font-body`) — never re-hardcode the hexes.

| Token | Value | Role |
|---|---|---|
| `--background` | `#191d25` | dark slate app base (lifted well off near-black) |
| `--surface` | `#262d38` | card / panel base — a clear step above `--background` |
| `--surface-2` | `#313a46` | elevated: modals, hovered cards, popovers |
| `--foreground` | `#f6f7f8` | primary text |
| `--muted` | `#c2c8d0` | secondary text (WCAG AA >7:1 on the slate base) |
| `--brand` | `#e01e2b` | GGPoker red — primary brand + destructive/all-in actions |
| `--brand-bright` | `#ff2d3f` | bright red — neon/bloom, `toneMapped={false}` glows |
| `--green` | `#22c55e` | money / success / call action |
| `--green-deep` | `#0a7d43` | deep green — money gradients, positive fills |
| `--gold` | `#f5c518` | premium / rewards / VIP accent |
| `--gold-lite` | `#ffd54a` | gold highlight / gradient top |
| `--cyan` | `#4a9eb0` | **demoted** — muted teal, verification/provably-fair accent ONLY (not a brand color) |

GGPoker semantics in one line: **red = brand + danger, green = money, gold =
rewards/premium, slate = chrome.** Cards are clean elevated `bg-surface` panels
(not glassmorphism). Every one of the 60+ screens inherits this by using the tokens
above — a screen that hardcodes off-palette hexes instead is a defect.

The `body` background is fixed (`background-attachment: fixed`) and layers two faint radials over the base: red `rgba(224,30,43,0.06)` from top-center and gold `rgba(212,175,55,0.05)` from top-right. Reproduce, do not "improve."

**Felt / card / state colours** — these live in the running components
(`ImageTable.tsx`, `Card.tsx`, `Seat.tsx`, `table-constants.ts`), not in a mock-up:
- Four-color deck: spades `#101317`, hearts `#e5484d`, diamonds `#2f6bff` (blue), clubs `#1fa85a` (green). The blue diamond is a functional SUIT colour, not a brand accent — it stays.
- Action / state tones: active/turn gold `#f3c14b`, **call green `#22c55e`** (kept distinct from all-in red), raise/gold `#e9c46a`, all-in red `#ff3b46` (`#ef4444` for the seat ring), fold/muted `#3a4250`, **idle seat ring neutral steel `#5b6472`** — red is reserved for all-in/danger, so idle seats never glow red.
- Gold accents on the felt (rings, empty-seat markers, pot pill, hero card border) are `#d4af37` / `rgba(212,175,55,…)`.
- Suit glow on hero cards (`Card.tsx` `suitGlow`): hearts `rgba(220,38,38,.5)`, diamonds `rgba(59,130,246,.5)`, clubs `rgba(34,197,94,.45)`, spades `rgba(148,163,184,.4)`.

### Typography — Space Grotesk + Manrope

Loaded once in `frontend-table/src/app/layout.tsx` via `next/font/google` and exposed as CSS vars:
- **Display** — `Space_Grotesk`, weights `["500","600","700"]`, var `--font-display`. Used for `h1/h2/h3` and `.font-display`. Headings are uppercase with wide tracking — see `HEADING_LG` (`font-display text-lg font-bold uppercase tracking-wider`) and `HEADING_SM` (`text-[11px] ... tracking-[0.25em] text-neutral-400`) in `tokens.ts`.
- **Body** — `Manrope`, var `--font-body`, is the default `font-family` on `body`.

Do not introduce a third typeface. Section eyebrows/labels are `text-[11px]` uppercase with `tracking-[0.2em]`–`[0.3em]`, matching the HUD.

### The table — ONE renderer, flat 2.5D (`ImageTable`)

**There is exactly one table renderer and no switch.** `/table` renders
`features/hrc/HrcTable.tsx`, which renders `features/hrc/components/ImageTable.tsx`:
a flat felt **image** with an absolutely-positioned DOM overlay, animated with
framer-motion. It is client-only (`dynamic(..., { ssr: false })`, `"use client"`)
per Golden rule 3.

There is **no 3D table**. A React Three Fiber cinematic scene once existed behind a
`render_style` / `override` branch; `/table` pinned `override="2.5d"`, so it was
dead for months while this file still called it the design contract. All of it —
`hrc/scene/`, `table3d/CinematicScene.tsx`, `table3d/LiveCinematicTable.tsx`,
`table3d/textures.ts`, `hrc/components/CSSPokerTable.tsx`, `table/tableGraphics.ts`
(a `"cinematic" | "classic"` preset nothing ever set), `useSceneSync`,
`store/useGameStore`, and the "Table Look" picker in `PrivateTableSetup` — is
deleted. **Do not reintroduce a second table renderer, a `render_style` branch, or
a graphics preset that selects between tables.** three/R3F remain in
`package.json` for 3D *avatars* only (see below); they are not for the table.

The composition, as it actually runs:

- **Felt** — `/images/poker-table-felt.webp`, `object-fill`, inside `FELT_BOUNDS`.
  Mounted by `TableFeltBackdrop` (always, so the pre-seat screen has a table under
  it) and by `ImageTable` once a snapshot exists.
- **THE box** — `FELT_BOUNDS` in `hrc/lib/table-constants.ts`: `left:50%`,
  `top:calc(50% + 45px)`, `width:72.9%`, `aspect-ratio:1408/768`, `maxHeight:90%`.
  The `+45px` is half the PlayerHeader's height. **Never re-derive the table box.**
- **Seats** — `TABLE_SEATS`, 10 hand-tuned entries expressed as PERCENTAGES OF THE
  FELT BOX, seat 0 = hero at bottom centre. Some are deliberately outside `0–100`
  (seats 2/3/7/8 sit at `x: -0.8` / `100.8`, just past the felt edge). This is an
  irregular hand-tuned ring, **not** a computed ellipse — do not "improve" it into
  trigonometry.
- **Community cards** — a centred flex row at `left:50% top:45%`, `gap-2.5`, `md`
  cards (70×105), dealt via `COMMUNITY_DEAL_FROM`.
- **Pot cluster** — a centred flex column at `left:50% top:25%`: `HAND n | POT: $x`,
  the phase label, then the chip stacks + gold pot pill.
- **Hero hole cards** — `HeroHoleCards`, fixed bottom-centre above the action dock,
  `lg` cards at `scale(0.72)`, fanned ±8° (±12° for 4-card PLO), with the
  hand-strength pill above them.
- **Dealer button** — `DEALER_POSITIONS`, same percentage-of-felt scheme.

### The felt-coordinate rule (this caused a full day of damage)

**Everything on the table is a percentage of ONE measured felt rectangle. There is
never a second coordinate system.**

There used to be two: the felt placed by static CSS (`FELT_BOUNDS`) and the seat
ring computed independently from the raw viewport (`computeTableLayout`:
`cy = height/2`, `ry = rx*0.56`, an 8% margin). Different centres, different aspect
ratios (1.833 vs 1.786), and only one of them honoured the Room-drawer inset — so
opening the drawer slid the seats 144px away from the table. They agreed at exactly
one window size.

The rules that keep it fixed:

1. **`useFeltStyle()` (`features/hud/feltLayout.ts`) is the ONLY source of the
   table's box.** Every consumer uses it: `TableFeltBackdrop`, `ImageTable`'s two
   layers, and `HrcTable`'s seat layer. Four components each deciding for
   themselves whether the drawer was open is what put the layers 144px apart.
2. **The felt wrapper carries `FELT_SURFACE_ATTR` (`data-felt-surface`).** Anything
   that needs table coordinates *measures that element* — `seatPointFromFelt()`,
   `layoutFromFeltRect()` — instead of recomputing them.
3. **`ResizeObserver` alone is not enough.** It fires on size changes, not position
   changes, so it misses the drawer sliding the felt sideways. `insetLeft` must be
   in the effect's dependency array. (Found by measurement: seat-to-centre ratios
   were `0.71–1.25` with the drawer closed vs `0.93/0.97` open.)
4. **One layer draws every seat.** Occupied seats and empty "SIT HERE" markers are
   both drawn by `HrcTable`'s seat layer from `TABLE_SEATS`. When `SeatHud` drew the
   empty ones separately, a vacant slot and the avatar that replaced it landed in
   different places, and positions beyond the snapshot's seat count vanished
   entirely (a 10-seat table showed 8).

### framer-motion owns `transform` — never fight it

**On a `motion` element, never write `transform` in `style`.** framer-motion
composes the entire `transform` property from the motion values it is given, so any
CSS `transform` on the same element is silently replaced the moment it animates.

To centre an absolutely-positioned motion element, use the standalone CSS
`translate` property (`CENTRING_TRANSLATE` in `ImageTable.tsx`), which framer does
not manage and which the spec applies *before* `transform`. Put rotation in the
motion props, not in `style`.

This one mistake mis-placed three things at once: the pot cluster sat at cx 932
against a felt centre of 800 — exactly half its own 264px width — and the dealer
button and burn card each hung 22px down-and-right of their anchors.

**Also: an `animate` target must name every value that branch owns.** framer leaves
a motion value it is *not* told about exactly where it is. `Card.tsx` animates
`x/y/rotate` while dealing face-down, then React reconciles the same element into
the face-up branch; that branch's `animate` listed only `rotateY/scale/opacity`, so
the deal spring was abandoned and the cards froze mid-flight forever (measured:
`translate(183.5, -91.8)`, a 95.9px vertical scatter across the board). Branches
restate the full resting pose — see `CARD_REST`.

### Three avatar modes — a player-selectable preset (avatars only, not the table)

Character rendering is a preset the player chooses, persisted per-device in
`features/table/renderMode.ts` (`localStorage` key `"poker.render.mode"`,
`useRenderMode()` hook + cross-component listeners), changed in
`hud/TableSettings.tsx`. This is about **avatars**; the table itself never changes.

1. **2D — HRC portraits (DEFAULT).** 104×104 circular WebP from `avatarSrc(id)`
   (`/avatars/<id>.webp`), neon ring + glow + gold owned-badge. Catalog, rarity
   tiers and ring/glow colours live in `features/table/avatars.ts` (`AVATARS`,
   `avatarForKey`, `avatarGradient` fallback). Must look intentional even if a
   portrait 404s (monogram-gradient fallback).
2. **3D — GLB via Tripo.** `features/table/Character3DGL.tsx` — `useGLTF` GLB from
   the Tripo pipeline, `<Suspense>`-wrapped, name/stack pill above. This is the only
   remaining R3F consumer in the app.
3. **MIX.** GLB for seats flagged `use3d`, portraits for the rest.

Keep all three switchable — never hard-code one mode.

### Glass-HUD panel system

Every floating text surface is a glass panel built from the shared tokens in `frontend-table/src/features/ui/tokens.ts` — compose with `cn()`, do not re-invent:
- `GLASS_PANEL` = `rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl`.
- `GLASS_PANEL_HOVER` adds `hover:border-white/20 hover:shadow-[0_0_24px_rgba(129,236,255,0.08)]` (subtle glow on hover).
- `BTN_GOLD` = gradient `from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad]`, black bold text, `hover:shadow-[0_0_22px_rgba(212,175,55,0.35)]`.
- `RARITY` map (common/rare/epic/legendary → text/border/glow) is the single source for tier styling.

HUD layout follows the proof: table info top-left, chat top-right, tournament stats bottom-left, player analytics bottom-right, pot label center, and the action bar bottom-center. Panels are `pointer-events-none` containers with interactive children opting back in.

### Motion — GSAP

Timeline/UI animation uses **GSAP** as the standard motion layer (chip flights, pot sweeps, card deals, panel enter/exit, win celebrations). Rules:
- GSAP drives **DOM/HUD and orchestrated sequences**; per-frame 3D object motion belongs in R3F (`useFrame`) — never fight the render loop with GSAP on Three objects.
- Always `gsap.context()`-scope and clean up in a React effect return; kill tweens on unmount. No leaked global tweens.
- Motion is restrained and purposeful — it signals state change, it does not decorate. Idle character motion uses the CSS keyframes already defined in `globals.css` (`seatIdleFloat`, `seatTurnBob`, `seatWinPulse`, `winSparkle`); reuse them rather than duplicating.
- Respect `prefers-reduced-motion`: gate non-essential motion.

### DOM-overlay-for-text rule

**All crisp text lives in the DOM, never baked into WebGL.** Names, stacks, pot, chat, analytics, action buttons, and the hero hole cards are DOM/HTML — either the absolutely-positioned `HudOverlay` on top of the `<Canvas>`, or drei `<Html>` anchored to a 3D point (seat pills/portraits). The 3D layer renders geometry, materials, and lighting only. Rasterizing labels into textures (except the deliberate stylized card-face canvas) is a defect: it blurs, it can't be selected/translated/reflowed, and it breaks accessibility.

### Non-negotiables

1. **One table renderer, and the felt is its only coordinate system.** Do not add a second table renderer, a `render_style` branch, or a graphics preset that switches between tables — that ambiguity is what made "the table" mean two different things for a full day. Everything on the felt is a percentage of the ONE measured felt rect (see "The felt-coordinate rule"). Never re-derive the table box from the viewport.
2. **Glow = hierarchy.** Glow encodes importance and state (active seat, all-in, premium/gold, red primary) via `box-shadow`/`drop-shadow` on the DOM layer. It is restrained. Never use glow as ambient decoration — if everything glows, nothing does.
3. **State never drifts.** The rendered UI is a pure projection of authoritative server state. No optimistic values that can disagree with the backend, no client-side "guesses" at stacks/pot/turn. Consistent with Golden rule 4 (no math fallbacks): the display reflects server truth or it shows nothing.
4. **Every rendered control binds to a real RPC — no dead buttons.** If a control is on screen (fold/check/call/raise/all-in, presets, host controls, membership, deposits), it is wired to a registered `backend-core` RPC and reflects real capability/permission gating. Ship no placeholder or decorative buttons. `?demo=1` uses static demo data precisely because it is a preview — production surfaces must be live. A control that selects a code path which no longer exists is a dead button too: when a renderer or mode is deleted, delete the picker that chose it.

## Working rules for agents (learned the hard way, 2026-08-02/03)

These are not style preferences. Each one is here because breaking it cost real
time and real trust.

1. **`main` is the deploy branch. Pushing to `main` IS deploying to Railway.**
   Nothing goes on `main` without being asked for, explicitly, for that specific
   change. "Merge and push" for one thing is not permission for whatever rides
   along with it. Develop on a branch; a branch push is inert and safe.
2. **A merge can change files your commits never touched.** When asked "did you
   change X", diffing only your own commits is not an answer — check the merge
   commits too (`git log --merges`, and diff the merge against *both* parents).
   Saying "nothing changed" while the owner is looking at a changed screen
   destroys the conversation. Verify before asserting, every time.
3. **Show, don't describe.** When the owner asks what a screen looks like, render
   it and screenshot it. `/table?demo=1` needs no backend. Do not reason about
   what the UI "should" show.
4. **Measure, don't infer.** Every real fix in this file's DESIGN-SYSTEM section
   was found by reading `getBoundingClientRect()` out of the live DOM, and every
   false one by reasoning from source. Numbers in the commit message; if a fix
   can't be measured, say so plainly instead of claiming it works.
5. **Verify against the right reference.** "Verified to the pixel" against the
   wrong baseline is worse than no claim. Check that what you measured is the
   thing the owner is looking at.
6. **Report what is NOT fixed, in the commit.** A commit that quietly fixes 2 of
   4 reported items reads as fixing all 4.
7. **Don't delete to "restore".** Rolling back to an older commit to undo a
   change silently discards everything landed since. Find the specific commit
   that introduced the regression.
8. **If a doc and the code disagree, the code wins — then fix the doc in the same
   change.** A stale binding doc is not harmless; it is an instruction to build
   the wrong thing. That is exactly what happened here.

## Railway deployment

One file defines the whole stack: `.railway/railway.ts`

```bash
railway login && railway link && railway config apply
```

Creates Postgres + `engine-math` + `backend-core` + `frontend-table` with env
wiring over `*.railway.internal`. Docs: `docs/RAILWAY.md`.

Do **not** add per-service `railway.json` — Railway IaC owns the project.

**Deploys are git-push driven.** Each service in `.railway/railway.ts` uses
`source: github(REPO, { rootDirectory, watchPatterns })`, so Railway is connected
to the GitHub repo and **auto-pulls + rebuilds + redeploys the changed service on
every push to the deploy branch (`main`)**. Pushing IS deploying — `railway config
apply` is only needed when the service topology or env wiring itself changes, not
for ordinary code changes. New/changed **secrets** are the one thing a push can't
carry — those are set in the Railway dashboard.

**Auth & identity are live (keys in the Railway env, not the repo).**
- **Clerk** is the required identity for members: `clerkMiddleware` gates every
  non-public route (`frontend-table/middleware.ts`), and the Clerk session is
  verified server-side (JWKS/RS256) and bridged to a Nakama session
  (`rpc/clerk.go` + `ClerkNakamaBridge`). Guests (no Clerk) may reach only the
  table-code path + `/table`.
- **Didit KYC/AML** enforces once `DIDIT_API_KEY` is set (it is): `requireVerified`
  only bypasses in the keys-unset branch, and every money path
  (`rpc/deposit.go`, `rpc/withdrawal.go`) calls `requireRealMoney()` +
  `guardJurisdiction()` + `requireVerified(…kyc_aml…)` together — money cannot
  move without real-money on AND jurisdiction AND KYC.

## Optional local Docker (legacy)

`docker compose up --build` boot order: `postgres` → `engine-math` →
`backend-core` → `frontend-table`. See `docs/DOCKER.md` and `docker-compose.yml`.

## Build & verify commands

```bash
# Frontend
cd frontend-table && npm install && npm run build

# Backend (plugin — must match Nakama 3.31.0)
cd backend-core && go vet ./... && go build -buildmode=plugin -trimpath -o backend-core.so .

# Engine
cd engine-math && cargo build && cargo test
```

> Note: `go build ./...` (without `-buildmode=plugin`) will report
> `function main is undeclared` — that is expected for a Nakama plugin package.

## Data model reference (backend-core/models)

- **Private Club Systems:** `Club`, `Owner`, `PlayerAllocatedBalance`,
  `CustomRakeConfiguration`.
- **Global Tournament Matrix:** `TournamentBracket`, `MultiTableBalancingRule`,
  `BlindTimer`, `PrizeDistributionPool`.

These structs carry `json` and `db` tags and are the canonical persistence
schema referenced by RPCs registered in `backend-core/main.go`.

## Player & integrity surfaces (recent)

Retention/engagement and operator/integrity features layered on the existing
engine — most are pure surfacing of RPCs that already existed:

- **GTO Trainer** (`/trainer`, `features/trainer/`): solo card-picker calling the
  existing solver RPCs (`hand_rank`, `equity_estimate`, `gto_advise`, `gto_solve`,
  `coaching_tip`) with `live:false`/`stakes:false` so the anti-RTA guard allows
  practice. No new backend.
- **Hand replayer** (`features/hands/HandReplayer.tsx`, from `/hands`): animated
  step-through reconstructed from the audit chain (`audit_list`). No new backend.
- **Showdown provably-fair CTA** (`features/game/ShowdownVerifyCTA.tsx`) + **spectator
  railbird** (`features/game/SpectatorBar.tsx`): surface `audit_verify_hand` and the
  already-supported non-seated watch + rail chat. No new backend.
- **Daily missions widget** (`features/dashboard/DailyMissionsWidget.tsx`): surfaces
  the existing missions backend (`missions_list`/`mission_claim`) on the dashboard.
- **Play-money / free-play** lobby entry (`PrivateTableSetup` `mode="playmoney"`):
  low-stakes, no-KYC-to-sit onboarding via the existing `table_create` (gates relax
  when `REAL_MONEY_ENABLED` is off). Honest framing: casual low stakes, not a
  separate currency.
- **Guest table reconciliation** (`store/guest_session.go`, `rpc/guest_session.go` →
  `guest_sessions_pending`/`guest_session_reconcile`): a guest (no email, non-Clerk)
  who sits at a club's private/coded table is recorded under the operator's table
  limit and reconciled from the ledger. Owner-Hub `GuestSessions` queue.
- **Automated collusion detection** (`antibot/collusion.go`, `rpc` `collusion_scan`):
  scores candidate pairs (chip-dump / soft-play / shared-device) from
  `poker_hand_stats` and writes to the existing `poker_collusion_flag` review queue
  (AntiCheat → Collusion → "Run scan"). Flags use status `open`.
- **Recurring club nights** (`store/clubschedule.go`, `rpc` `club_schedule_create`/
  `club_schedule_list`/`club_night_launch_now`): operators save a table template and
  launch it on demand (auto-fire at the scheduled time is a follow-up). Owner-Hub
  `ClubNights`.

Guest vs registered detection idiom (backend): `isGuest` = account with no email
AND custom id not prefixed `clerk:` (see `match/holdem/handler.go`).
