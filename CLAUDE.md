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
> as a React Three Fiber cinematic scene, anchored to a "src/app/proof/"
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
dead for months while this file still called it the design contract. All of it is
deleted — these paths no longer exist and must not come back:

```
src/features/hrc/scene/                      the whole R3F scene
src/features/table3d/CinematicScene.tsx
src/features/table3d/LiveCinematicTable.tsx
src/features/table3d/textures.ts
src/features/hrc/components/CSSPokerTable.tsx
src/features/table/tableGraphics.ts          "cinematic" | "classic", never set
src/features/hrc/useSceneSync.ts
src/features/hrc/store/useGameStore.ts
src/app/proof/                               the old "design reference"
HrcTable's `override` prop + HrcRenderStyle + the 3D branch
PrivateTableSetup's "Table Look" picker
```

**Do not reintroduce a second table renderer, a `render_style` branch, or a
graphics preset that selects between tables.** three/R3F remain in
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
- **A table with fewer than 10 seats must SPREAD over that ring, never take the
  first N.** `TABLE_SEATS[0..5]` is hero-bottom, bottom-left, left-bottom,
  left-top, top-left, top-centre — the whole left and bottom of the felt, with
  the entire right half bare. A 6-max table rendered exactly that way in
  production: six "SIT HERE" cards bunched down the left side. Go through
  `seatRingIndex()` / `seatPose()` / `dealerPose()` in `table-constants.ts`,
  which walk `seatCount` seats evenly around the ten positions and keep hero at
  index 0 (6 → `0,2,3,5,7,8`; heads-up → `0,5`; 10 → unchanged). The seat layer,
  the empty "SIT HERE" markers and the dealer button must all use it, or they
  land on different rings again.
  `npm run check:table`'s **`seat-ring-spread`** check now proves this for every
  count 2–10 by evaluating the real `seatRingIndex` against the real
  `TABLE_SEATS`: no two seats may share a position, hero stays at 0, and from 4
  seats up both halves of the felt must be used. It fails on the naive
  `visualIndex % ring` mapping that shipped.
  `?demo=1` is a 10-max fixture, so it cannot show this class of bug at all —
  that is precisely how it reached production. **A rendered screenshot of a
  non-10 table still needs the local stack**; the check proves the geometry, not
  the render.
- **Seat count comes from the TABLE, never from a default.** `SeatHud` reads
  `snapshot.max_seats`, and **no snapshot means no seats** — not
  `DEFAULT_MAX_SEATS`. That constant is the /lobby create form's starting value
  (6 of 2–10), not a property of any table. Falling through to it drew six "SIT
  HERE" cards advertising a $1,000 buy-in on `/table` with no match: fabricated
  state (non-negotiable 3) *and* six dead buttons, since `sitDown()` calls
  `sendMatch(OpSitDown, …)` and there is no match to send to (non-negotiable 4).
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

## Landing page — never a place to play (BINDING)

The landing page (`/` -> `features/landing/LandingClient.tsx`) is a MARKETING
surface. **You cannot join, create or play a game from it.** No link to
`/table`, no table code box, no "deal me in", no room builder.

It shipped with an "Enter a table" CTA pointing straight at `/table`, which put
an anonymous visitor on a felt carrying a Create/Join drawer. The owner has
reported this more than once; it kept coming back because this file never said
it. It says it now.

Where each thing belongs:

| Job | Screen |
|---|---|
| Marketing / sign-in / sign-up | `/` (landing) |
| Start playing | `/login` |
| Create a game (private, public, play-money) | `/lobby` — `PrivateTableSetup`, four modes |
| Join by code | `/lobby` (`JoinPrivateGame`) or the centre card on `/table` |
| Create a tournament | `/tournaments` — `CreateTournamentPanel` |
| Play | `/table` |

**One job per screen.** Game setup does not belong on the felt either: the
`RoomPanel` Create/Join drawer was a third copy of what `/lobby` already does,
stacked over the table, and is now unmounted (`SHOW_LEFT_PANEL_COLUMN`).
## Coded guests must be approved before they sit (BINDING)

A visitor holding a table code but **no registered account** may WATCH a table
immediately. **Taking a seat requires a club operator to approve them.**

Why: a code gets forwarded. Without the gate, an unbounded number of strangers
sit down holding chips at a table the club is legally accountable for, and the
operator cannot say who any of them were.

- **Enforcement is the sit-down gate in `match/holdem/handler.go`** — the only
  place a seat is granted. It runs BEFORE `reserveBuyIn`, so no funds move for a
  player who cannot sit. An RPC that records a decision is not a gate.
- **Queued on the first SIT ATTEMPT, not on join** — a railbird who only watches
  must not fill the operator's queue.
- **`IsApproved` fails CLOSED.** A DB error means *not approved*. A wrong `false`
  costs one person a wait; a wrong `true` seats an unidentified player with a
  balance.
- **Decisions are atomic** (`status='pending'` in the UPDATE). Two operators
  clicking opposite buttons produce one winner and one explicit conflict.
- **`trust_code_guests`** (per table, **default false**) seats code holders
  immediately — but still WRITES the approval, decided by `"system"`, so the
  audit trail never has a hole. Home games turn it on; public coded tables leave
  it off.
- The operator queue is `OwnerHub > GuestApprovals`, above `GuestSessions`:
  approvals block a live player, reconciliation is settle-up afterwards.

Do not confuse `poker_guest_approval` (this gate) with `poker_guest_session`
(opens once a guest HAS sat, to settle their chips afterwards).

## NEVER descope work on your own authority (BINDING)

**You do not get to decide that part of what was asked is a "follow-up".** Only
the owner descopes. If a piece is hard, slow, blocked on a credential you do not
have, or looks optional to you — that is not your call to make.

This rule exists because it was broken twice in one session, both times in the
agent's own favour:

- The owner asked "should a coded guest at least have to give an email?", the
  agent recommended email + one-time code, the owner said go — and the agent
  then opened the next message with "two calls I'll make rather than re-ask:
  email verification is a follow-up" and shipped everything else. The owner
  never asked for it to be deferred. It was the largest remaining piece and it
  needed a Clerk setting the agent could not change, so it got dropped and the
  drop was reported as settled.
- In the same exchange the agent asked "that's an auth change, want me to make
  it on the same branch?", got "yes I want and go", built half, and never
  returned to the middleware.

What to do instead, when something in scope cannot be finished:

1. **Say so in the message where you notice it**, not in a commit body the
   owner may never read. Name the blocker.
2. **Deliver everything that does not depend on it**, then stop and ask.
3. If a credential or dashboard setting is the blocker, **build the code path
   anyway** and hand back the exact switch the owner has to flip.
4. **Never** phrase your own scope reduction as a shared decision — no "we
   agreed", no "as discussed", no "two calls I'll make rather than re-ask".

A related habit from the same session: deciding what a word means and then
reporting against your own definition. "The table" meant `?demo=1` to the agent
and `/table` to the owner for days. If a term could mean two things, ask which,
or state plainly which one you measured.

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

## A player has TWO wallets — never show a bare "Wallet" figure (BINDING)

1. **Global wallet** — `profile.walletCents`, the certified balance that follows
   the player everywhere. Funded by deposits, gated by KYC.
2. **Club wallet** — `snapshot.hero_club_balance`, chips a club has allocated to
   this player at this table. Table-local.

`BuyInDialog` is the reference: it offers whichever are available, labelled
**"Global wallet"** and **"Club wallet"**, and `sitDown(seat, buyIn, wallet)`
carries the choice to the server, which is the authority on both.

The header used to print `profile.walletCents` under the single word "Wallet",
and the club balance appeared **nowhere** outside the buy-in dialog — so at a
club table a player could not see their club chips at all, and the owner read
the header figure as the club balance when it was the global one. An unlabelled
money figure gets read as whichever wallet the reader has in mind.

**Any surface showing a balance must say which wallet it is.** `PlayerHeader`
now shows "Global" always and "Club" only when the table actually has a club
balance (`null`, not `0`, when there is none — never invent a $0.00 club wallet
at a table with no club behind it).

Related rule already in the engine: registered players buy in from the certified
global wallet; club-allocated comp chips are for guests (see the certification
comment in `match/holdem/handler.go`).

## Automated design checks — `npm run check:table` (BINDING)

`frontend-table/scripts/check-table-invariants.mjs`. **Run it after any table
change.** These exist because a doc alone already failed once: CLAUDE.md pointed
at a design-reference directory that had been deleted, for months, and nothing
complained. (Check 1 is why that path cannot be named here in prose — only
inside a fenced block, where this file records what it deleted.)

| # | check | what it prevents |
|---|---|---|
| 1 | `doc-paths` | CLAUDE.md naming a file that does not exist |
| 2 | `one-renderer` | a second table renderer / `render_style` branch coming back |
| 3 | `r3f-scope` | three/R3F leaking out of 3D **avatars** into the table |
| 4 | `motion-transform` | `transform` in `style` on a `<motion.*>` — framer overwrites it |
| 5 | `one-felt-box` | a second coordinate system (`FELT_BOUNDS` spread without `useFeltStyle()`, or any `computeTableLayout` caller) |
| 6 | `demo-is-data-only` | `?demo=1` changing LAYOUT or VISIBILITY instead of only DATA |
| 7 | `seat-ring-spread` | seats bunching on one side at any count 2–10 |

Two rules about this script:

- **A check that has never failed is not a check.** When adding one, deliberately
  reintroduce the bug, confirm it fails, then revert. Checks 6 and 7 were both
  proved that way.
- The `KNOWN` maps are for cases where fixing the code would demonstrably MOVE
  the design — not for silencing noise. `motion-transform`'s map is currently
  **empty**: its one entry (Seat.tsx bet chips) was resolved by measuring
  `style.transform` in the live DOM, finding `none`, and deleting a declaration
  that had never applied — zero pixels moved.

### `?demo=1` may substitute DATA. It may never change LAYOUT or VISIBILITY.

This is check 6, and it is the single most expensive lesson in this file. Three
separate `!demo` branches — the 13-panel column, the felt's 144px inset, and the
action dock's alignment — each made the preview render a *different layout* from
`/table`, so every screenshot taken against `?demo=1` "confirmed" a table the
owner was never looking at. The felt sat at centre 800 in demo and 944 live.

Substituting data is what a preview IS: swap `DEMO_SNAPSHOT` for the live
snapshot, fake `actionRequired`, stub `sendAction`. The pattern for a component
that gates on a match is `const tableId = demo ? DEMO_SNAPSHOT.match_id :
matchId` — substitute the **id**, then run one guard identical on both pages.
See `ChatStatsPanel`, `HandHistoryPanel`, `EmotePicker`.

## `npm run verify` — run this before you claim anything works (BINDING)

```bash
cd frontend-table && npm run verify             # starts the stack itself, then runs everything
cd frontend-table && npm run verify -- --static # static only, no stack, no browser
cd frontend-table && npm run stack:up           # just the stack
cd frontend-table && npm run stack:status       # what is running, change nothing
```

**It starts the stack for you.** `scripts/stack-up.mjs` is idempotent and brings
up Postgres (initdb + `nakama migrate up` + `schema.sql` on first run),
engine-math, and Nakama with a freshly built `backend-core.so`. Proven from a
completely cold machine: all three stopped, one `npm run verify`, 8 passed.
Anything it cannot do — no Nakama binary, engine-math not built — is reported
with the exact command to fix it, never silently skipped.

**Why it exists.** A nil-pointer dereference in `seatUsername` shipped to `main`
and SIGSEGV'd the **whole Nakama process** whenever a player left a club table
with an empty chair — nearly every club table. It passed `go vet`, the plugin
build, `tsc`, `npm run build`, and a 17/17 sit-down suite. Every gate was green,
because every gate answered *"does it compile / does the code I was thinking
about work"* and none answered *"does the app survive being used"*.

Four phases, in this order:

| phase | what it proves |
|---|---|
| 1 static | `tsc`, `check:table` (7 invariants), `go vet`, plugin builds |
| 2 e2e | seat lifecycle, **a full hand**, three-tier gate, club loan settlement — against the REAL stack |
| 3 render | `/table`, `?demo=1`, `/`, `/lobby`, `/clubs`, `/tournaments` measured off the live DOM |
| 4 build | `next build` — LAST, because it clobbers a running dev server's `.next` |

**`ENGINE_MATH_URL` is not optional when Nakama runs natively.**
`poker/enginemath/client.go` falls back to `http://engine-math:8080`, a
docker-compose hostname that does not resolve outside compose. Without the var
the shuffle fails, `StartHand` errors, and `autoStartHand` quietly sets
`DealerDown` — **no client error, no WARN log, hands simply never begin**
(Golden rule 4: there is no local shuffle fallback to mask it). `stack-up.mjs`
sets it. This was live in that script until `handplay-e2e.mjs` existed, because
every earlier harness only sat players down and none ever dealt.

**A SKIP IS NOT A PASS.** When the stack or dev server is down, those phases
report `SKIP` with the reason and the summary says *"green, but INCOMPLETE"*.
Reading a partial green as "it works" is the exact mistake this file exists to
stop.

### The three gaps it closes — each one shipped a bug

1. **No full-lifecycle test.** Sitting down was tested exhaustively; standing up
   was never exercised once. `scripts/table-sim/lifecycle-e2e.mjs` runs
   join → sit → stand → MatchLeave → settle, and asserts **the server is still
   alive afterwards** — a panic in a runtime plugin kills the process, so
   "assertions passed" and "the server survived" are different questions.
   Verified to catch the real bug: reintroducing the nil deref makes it fail
   with `NAKAMA SURVIVED THE STAND-UP` and one panic in the log.
2. **No render step.** Screenshots were taken by hand and skipped under
   pressure, which is how an unverified table reached `main`.
   `scripts/verify-render.mjs` **asserts** felt centre = 800 on both pages, that
   demo and live agree on the felt box, no panel column, no create control, no
   phantom seats. Every assertion is a bug that actually shipped.
3. **No single command.** Stack setup was ~10 manual minutes, so it did not get
   run.
4. **No hand was ever played.** Blinds, betting, street progression, showdown
   and pot award were exercised by nothing that runs the real server.
   `scripts/table-sim/handplay-e2e.mjs` drives two websocket clients through a
   full hand and asserts on **server snapshots only** — never on numbers the
   test computed. The assertion worth having is **chip conservation**: total
   chips (stacks + pot) measured from the first snapshot must equal the last.
   That catches side-pot and award bugs no single-function unit test would.
   Its baseline is *measured, not assumed* — the first version asserted against
   the buy-in it had requested and failed 200000 vs 400000 because the request
   used `buy_in_cents` when the wire field is `buy_in`, so every player silently
   took the table default. The test was wrong and the server was right.

### Local stack

```bash
initdb -D /var/lib/pgdata -U postgres --auth=trust      # once
pg_ctl -D /var/lib/pgdata -o '-c listen_addresses=127.0.0.1 -p 5433' start
nakama migrate up --database.address postgres:postgres@127.0.0.1:5433/nakama
psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -f backend-core/store/schema.sql
cd backend-core && go build -buildmode=plugin -trimpath -o /tmp/modules/backend-core.so .
nakama --database.address postgres:postgres@127.0.0.1:5433/nakama --runtime.path /tmp/modules
./engine-math/target/release/engine-math-server                     # :8080
```

Nakama must be **3.31.0** — the plugin only loads into a server built from the
same `nakama-common`. Harnesses expect Postgres on **5433**.

> The Owner Hub needs an authenticated club owner and Clerk cannot authenticate
> locally. `scripts/table-sim/hub-settlement-shot.mjs` works around it by writing
> a real Nakama session into `localStorage` under `png-nakama-session`, in the
> exact shape `lib/nakama/auth.ts`'s `persistSession()` uses — drop
> `refresh_token`/`user_id` and `ensureSession()` discards it, silently falls
> back to a fresh device account with no club, and the page renders
> "COULDN'T LOAD". The settlement panel also lives under the **Member Registry**
> section, which is state nav rather than a route, so it has to be clicked.

## Build & verify commands

> **Never run `npm run build` while `npm run dev` is running.** Both write
> `.next`, so the build replaces the chunks the dev server is serving and it
> starts throwing `Cannot find module './<id>.js'`. The symptom looks exactly
> like a UI regression — hero cards vanish, stray blank rectangles appear where
> cards should be — and it is not one. Stop dev, or `rm -rf .next` and restart.

```bash
# Frontend
cd frontend-table && npm install && npm run build
cd frontend-table && npm run check:table    # 7/7, after ANY table change

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
