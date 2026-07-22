# poker-next-gen — Final Implementation Plan (for Owner Approval)

> Single source of truth for rebuilding the full High Rollers Club (HRC) surface — all 53 screens — in poker-next-gen's guaranteed "Neon Vault" look, wired to Nakama, with the missing backend built. Approve this before build.

---

## 1. Context — why we are doing this

- **The look is locked and proven.** The owner approved the cinematic proof under `frontend-table/src/app/proof/` (`CinematicTable.tsx`, `ClubDashboard.tsx`, reachable at `/proof` and `/proof?screen=club`). That proof — obsidian graphite base, cyan primary, gold premium accent, R3F 3D table, glass HUD panels — is now the **binding contract** for every pixel a player sees. It is the definition of "done," not aspirational styling.
- **The mandate.** Take every HRC screen (a REST/Next fork with three renderers incl. Flutter) and **rebuild it in our look, wired to Nakama over `callSessionRpc` and the match socket** — not ported markup, not `fetch("/api/…")`. Where HRC has a feature our backend can't yet serve, **build the missing Go backend** (RPCs, store tables, match opcodes, engine-math changes).
- **Renderers collapse from three to two.** HRC's 2D `ImageTable` / 3D `PokerSceneCanvas` / embedded Flutter becomes our **Pixi 2D table** + a **promoted R3F cinematic table**. **Flutter is dropped entirely.**
- **Avatars are a player-chosen graphics preset, all three first-class.** 2.5D HRC portraits are the **DEFAULT**; 3D GLB (Tripo) is the premium upgrade; MIX is a table of both. Persisted per-device via `renderMode.ts`. No work may hard-code one mode.
- **Four non-negotiables carry through everything:** (1) no HTML/CSS faking the 3D table; (2) glow encodes hierarchy/state and is threshold-gated, never ambient; (3) rendered UI is a pure projection of authoritative server state — no optimistic drift; (4) every rendered control binds to a real RPC — no dead buttons. These align with the repo Golden Rules (client-only Pixi/R3F, no math fallbacks — all shuffle/rank/showdown/equity go through `engine-math`).
- **New shared deps this plan introduces:** `zustand` (client table/UI state store), `gsap` (DOM/HUD orchestration + count-ups + scrubber), `framer-motion` (lobby/creation list & modal choreography where porting HRC verbatim is cheapest), `jspdf` (hand-history export). Per-frame 3D motion stays in R3F `useFrame` — never GSAP on Three objects.

---

## 2. Design-System block — paste into `/home/user/poker-next-gen/CLAUDE.md`

> Insert immediately after the "Golden rules" section, before "Railway deployment". Every hex/token/number is quoted verbatim from live source; parenthetical citations are files of record, not text to paste.

```markdown
## DESIGN-SYSTEM — the guaranteed look (BINDING)

This section is the contract for **all** UI. It is the definition of "done" for anything a
player sees. The reference implementation is the cinematic proof under
`frontend-table/src/app/proof/` (`CinematicTable.tsx`, `textures.ts`, `proofData.ts`,
`ClubDashboard.tsx`, reachable at `/proof` and `/proof?screen=club`). When in doubt, open the
proof and match it. Deviating from these values is a defect, not a preference.

### Palette — graphite / cyan / gold (dark-only)

"Neon Vault": obsidian graphite base, cyan primary, gold premium accent. **Dark-only by
design** — do not add a light mode. Canonical tokens live in
`frontend-table/src/app/globals.css` (`:root` + `@theme inline`) and must be referenced through
the Tailwind theme (`bg-background`, `text-foreground`, `text-cyan`, `text-gold`, `font-display`,
`font-body`), never re-hardcoded.

| Token         | Value      | Role                       |
|---------------|------------|----------------------------|
| `--background` | `#0b0b0e` | obsidian app base          |
| `--foreground` | `#ededf2` | primary text               |
| `--gold`       | `#d4af37` | premium accent             |
| `--gold-lite`  | `#f3e2ad` | gold highlight / grad top  |
| `--cyan`       | `#81ecff` | primary / neon             |

`body` background is fixed (`background-attachment: fixed`) layering two faint radials over the
base: cyan `rgba(129,236,255,0.06)` from top-center, gold `rgba(212,175,55,0.05)` from top-right.
Reproduce, do not "improve."

**Scene / 3D palette** (`proof/CinematicTable.tsx` + `proof/textures.ts`) — exact material colors,
part of the look:
- Scene bg & fog `#05070c` (fog range `[12, 26]`); page gradient
  `linear-gradient(180deg,#04060a,#070b12 60%,#04060a)`.
- Felt: radial `#1c7d4e` → `#0f5f39` → `#053821` edge, weave noise (±14), `rgba(212,175,55,0.85)`
  gold inner ring, faint `♦` mark.
- Gold ring (flat): `#f1cf6b`, emissive `#8a6a1e` @ `0.5`, `metalness 1`, `roughness 0.28`.
- Cyan neon rim: `#7fe9ff`, `meshBasicMaterial`, `toneMapped={false}`.
- Gunmetal outer rail: `#171b22`, `metalness 0.95`, `roughness 0.32`; gold pinstripe `#e9c46a`
  emissive `#6b501a`.
- Four-color deck (canvas + DOM hero cards): spades `#101317`, hearts `#e5484d`, diamonds
  `#2f6bff` (blue), clubs `#1fa85a` (green).
- Action/state tones: active/turn gold `#f3c14b`, call/cyan `#22d3ee`, raise/gold `#e9c46a`,
  all-in red `#ff3b46` (`#ef4444` seat ring), fold/muted `#3a4250`, purple accent `#b44dff`.

### Typography — Space Grotesk + Manrope

Loaded once in `layout.tsx` via `next/font/google`, exposed as CSS vars.
- **Display** — `Space_Grotesk`, weights `["500","600","700"]`, var `--font-display`; `h1/h2/h3` +
  `.font-display`. Headings uppercase, wide tracking — `HEADING_LG`
  (`font-display text-lg font-bold uppercase tracking-wider`), `HEADING_SM`
  (`text-[11px] … tracking-[0.25em] text-neutral-400`) in `tokens.ts`.
- **Body** — `Manrope`, var `--font-body`, default `font-family` on `body`.
No third typeface. Eyebrows/labels `text-[11px]` uppercase `tracking-[0.2em]`–`[0.3em]`.

### Cinematic R3F table (reference = `proof/`)

React Three Fiber (`@react-three/fiber` v9, `@react-three/drei` v10, `three` 0.171,
`@react-three/postprocessing`), client-only (`dynamic(… { ssr:false })`, `"use client"`) — never
SSR-imported (Golden rule 3). Mandated composition exactly as `CinematicTable.tsx`:
- **Felt** — `feltTexture()`, `roughness 0.92`, `metalness 0.02`, 128-seg circle scaled `[5.35,3.55]`.
- **Gunmetal rail** — `torusGeometry`, `#171b22`, high metalness, thin emissive gold pinstripe torus.
- **Gold ring** — flat emissive `ringGeometry` (`#f1cf6b`) inset in felt.
- **Neon seat rings** — per-seat color encodes state (active `#f3c14b`, all-in `#ff3b46`, folded
  `#3a4250`, else character `ring`) + matching `box-shadow`; felt edge carries cyan `#7fe9ff` rim.
- **Beveled 4-color cards** — real `boxGeometry` `[0.66,0.03,0.92]` slabs, per-face material array
  (white edges, textured top via `cardFaceTexture`, faint `emissiveMap` @ `0.14`). Not sprites.
- **Instanced chip stacks** — `ChipStack` `cylinderGeometry` at `y=i*0.032`; pot is five colored
  stacks (`#c9302c`, `#1f2937`, `#2f6bff`, `#e9c46a`, `#1fa85a`). Real stacked geometry.
- **Restrained bloom** — `EffectComposer` `Bloom intensity={0.55} luminanceThreshold={0.55}
  luminanceSmoothing={0.2} mipmapBlur` + `Vignette offset={0.28} darkness={0.82}`. Threshold-gated;
  do not crank intensity or drop threshold.
- **Fixed hero camera** — `position:[0,6.9,7.9], fov:42`, `ACESFilmicToneMapping`, exposure `1.15`,
  `dpr={[1,2]}`, `shadows`. No free-orbit `OrbitControls` at the live table.
- **Lighting** — warm key `spotLight` `#fff4d8` (shadow) + cyan/gold/purple accent `pointLight`s +
  `Environment` of three `Lightformer` rects (white key, cyan `#38e6ff` left, gold `#ffcf6a`
  right) + `ContactShadows` (`opacity 0.5`). Tri-color rim lighting is identity.
Seats on ellipse `SX=4.95`, `SZ=3.2`; seat 0 = hero bottom-center.

### Three avatar modes — player-selectable preset

Persisted per-device in `features/table/renderMode.ts` (`localStorage` `"poker.render.mode"`;
`useRenderMode()` + cross-component listeners). Scene branches per-seat
(`is3d = mode==="3d" || (mode==="mix" && seat.use3d)`):
1. **2.5D — HRC portraits (DEFAULT).** `SeatPortrait2D`: 104×104 WebP `avatarSrc(id)`, neon ring +
   glow + gold owned-badge via drei `<Html>`. Catalog/tiers in `features/table/avatars.ts`. Must
   look intentional even on 404 (monogram-gradient fallback).
2. **3D — GLB via Tripo.** `GlbFigure`: `useGLTF` (`seat.model` or `/models/house.glb`), yawed to
   center, `<Suspense>`, name/stack pill via `<Html>`.
3. **MIX.** 3D for seats flagged `use3d`, 2.5D for the rest.
`AvatarMode = "2d" | "3d" | "mix"` — all three must stay switchable; never hard-code one.

### Glass-HUD panel system

Compose from `features/ui/tokens.ts` with `cn()`; do not re-invent.
- `GLASS_PANEL` = `rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl`.
- `GLASS_PANEL_HOVER` adds `hover:border-white/20 hover:shadow-[0_0_24px_rgba(129,236,255,0.08)]`.
- `BTN_GOLD` = gradient `from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad]`, black bold text,
  `hover:shadow-[0_0_22px_rgba(212,175,55,0.35)]`.
- `RARITY` map (common/rare/epic/legendary → text/border/glow) is the single tier-styling source.
HUD layout per proof: table info top-left, chat top-right, tournament stats bottom-left, analytics
bottom-right, pot center, action bar bottom-center. Panels `pointer-events-none`; children opt in.

### Motion — GSAP

- GSAP drives DOM/HUD + orchestrated sequences; per-frame 3D motion belongs in R3F `useFrame` —
  never fight the render loop with GSAP on Three objects.
- Always `gsap.context()`-scope, clean up on effect return, kill on unmount. No leaked tweens.
- Motion signals state change; it does not decorate. Idle character motion reuses `globals.css`
  keyframes (`seatIdleFloat`, `seatTurnBob`, `seatWinPulse`, `winSparkle`).
- Respect `prefers-reduced-motion`.

### DOM-overlay-for-text rule

**All crisp text lives in the DOM, never baked into WebGL.** Names, stacks, pot, chat, analytics,
action buttons, hero hole cards → DOM/HTML (`HudOverlay` over `<Canvas>` or drei `<Html>` anchored
to a 3D point). The 3D layer renders geometry/materials/lighting only. Rasterizing labels into
textures (except the deliberate stylized card-face canvas) is a defect.

### Non-negotiables

1. **No HTML/CSS faking the cinematic.** The 3D look comes from real R3F geometry/materials/
   lighting/post — not gradient `div`s. The proof is the bar.
2. **Glow = hierarchy.** Bloom/glow encodes importance/state, threshold-gated (`0.55`/`0.55`).
   If everything glows, nothing does.
3. **State never drifts.** Rendered UI is a pure projection of authoritative server state. No
   optimistic values, no client guesses at stacks/pot/turn. Server truth or show nothing.
4. **Every rendered control binds to a real RPC — no dead buttons.** Fold/check/call/raise/all-in,
   presets, host controls, membership, deposits — all wired to a registered `backend-core` RPC
   with real capability/permission gating. Ship no placeholder buttons.
```

---

## 3. Screen-by-screen build mapping (by group)

> Route col = our App Router path. Look col = which proof/token asset realizes it. Wire col = RPCs/opcodes (EXISTING vs **NEW**). Effort S/M/L. Every dropped-by-omission HRC screen from the critic's checklist is folded in below and tagged **[critic-added]**.

### 3.1 In-game table & controls — route family `/table`

The whole surface already lives on `/table` (`page.tsx` wraps `GameProvider` + `TableHud`). The live game runs over the Nakama match socket (`match/holdem`, opcodes in `protocol`). Most "screens" are DOM overlay panels wired to `useGame()` or a `callSessionRpc`. Promote `proof/CinematicTable.tsx` + `textures.ts` into a real `features/table3d/` renderer fed by `snapshot`/`holeCards`.

| Screen | Route / mount | Look | Wire | Effort |
|---|---|---|---|---|
| **Table shell + renderer switch** (Game.tsx) | `/table` (existing) | Keep Pixi as **2D**; add `features/table3d/CinematicTable` as **3D**, live from `snapshot`/`holeCards`; top bar → `GLASS_PANEL` strip; renderer toggle extends `renderMode.ts` into a segmented control | Pill ← `connected`; label/blinds/phase/hand/pot ← `snapshot`; room code ← `roomCode`+`room_resolve`; renderer/felt/BGM/mute client-only. **Flutter DROPPED** | L |
| **Action bar** (Controls.tsx) | `/table` BR | Restyle `features/hud/ActionBar.tsx` to `BTN_GOLD`/neon, GSAP press | `sendAction`→`OpAction=3`; legality ← `OpActionRequired=105`; turn ← `actionRequired.seat===heroSeat`. EXISTING | S |
| **Pre-action toggles** | `/table` above ActionBar | Restyle `PreActionBar.tsx`/`preAction.ts` neon chips | Client-only queue → same `sendAction`. EXISTING | S |
| **Bet slider / sizing** | in ActionBar | Gold GSAP range fill | bounds ← `min_raise`/`max_raise`; `OpAction {raise}`. EXISTING | S |
| **Chat** | `/table` left rail | Polish `ChatPanel.tsx` to `GLASS_PANEL` | `sendChat`→`OpChatSend=5`; in ← `OpChat=111`. EXISTING | S |
| **Emotes** | new `features/hud/EmoteBar.tsx` | Mirror taunt pattern; bubbles over seats via `seatLayout.ts` | `OpChatSend {"::emote:<id>::"}` marker parsed in `GameProvider`. No new opcode | S |
| **Taunts (voice)** | mount in rebuilt HUD | `TauntBar.tsx` shipped | `::taunt:` marker → `soundManager.playTaunt`. EXISTING | S |
| **Commentary + TTS** | new `CommentaryOverlay.tsx` + menu toggle | bottom-center glass subtitle, gold/cyan speaker, GSAP fade | **NEW** `commentary_generate` RPC and/or `OpCommentary` broadcast; omniscient flag **server-gated** (see §D risks); new `integrations/tts.go` + LLM key | L |
| **Insurance** | new `InsurancePanel.tsx` modal | centered `GLASS_PANEL`, gold accept/red decline, GSAP ring | **NEW** `OpInsuranceOffer`/`OpInsuranceAccept`; equity ← `enginemath.EstimateEquity`; settle + house bankroll in match loop; `poker_insurance` store | L |
| **Run-it-twice** | new `RunItPanel.tsx` + multi-board strip | vote chips + countdown | **NEW** `OpRunItTwice`; `poker/showdown_async.go` N-runout; engine-math multi-board; multi-board `OpShowdown` | L |
| **Hand-history drawer** | `HandHistoryPanel.tsx` (exists) | restyle `GLASS_PANEL`, optional mini board | `audit_list` (exists) + `audit_verify_hand`; **share** button NEW (`replay_share`) | S / M |
| **Video overlay** | new `VideoBar.tsx` + `VideoThumbnail` | gold-ringed tile over seat | **NEW** `video_token` RPC + `integrations/daily.go`; WebRTC via Daily SDK | L |
| **AI-analysis panel** | new `AnalysisPanel.tsx` | glass, cyan headers, EV bars | reuse `gto_solve`/`gto_advise`/`coaching_tip`/`equity_estimate`/`hand_rank`; optional **NEW** `hand_analyze` LLM narrative (falls back to `coaching_tip.rationale`) | M |
| **Coaching overlay** | new `CoachingOverlay.tsx` + toggle | glass card near action bar, severity color | `coaching_tip` on hero turn (debounced), backed by `gto_advise`. EXISTING | M |
| **Player-analytics + opponent HUD** | new `AnalyticsPanel.tsx` + per-seat `HudBadge` | stat tiles w/ meters, badge chip | **NEW** `player_stats` RPC over `poker_hand_stats` (match-loop write); classification client-side | L |
| Showdown overlay | new `ShowdownOverlay.tsx` | pot-sweep via `chipAnimation.potToWinner` | `OpShowdown=106`. EXISTING | M |
| Hand-strength meter | fold into `EquityPanel.tsx` | — | `hand_rank`. EXISTING | S |
| Card squeeze | client touch reveal over `holeCards` | — | none | S |
| Theme picker (felt/card-back) | reuse cosmetics | — | `cosmetic_list`/`cosmetic_equip`+`deckStyle.ts`; felt dye NEW `cosmetic_dye_set` | S / M |
| Blind indicator + tournament results | display | — | `blind_level_list`+`OpBlindUpdate=109`+`OpTournamentInfo=110`. EXISTING | S |
| Sit-out/in + rebuy | player menu | — | **NEW** `OpSitOut`/`OpSitIn`/`OpRebuy`; leave via `OpStandUp` | M |
| In-game host/admin | `HostPanel.tsx` (exists) | extend | `OpHostAction=6` (exists); +approve-waiting/wallet-limit | S / M |
| Bomb-pot indicator | display | — | **NEW** `OpBombPot` + `poker/table.go` | M |
| Breaking-news modal | new | — | **NEW** `announcement_list` (+Nakama notify) | S (opt) |
| BGM / mute | shipped | — | `soundManager`. EXISTING | — |
| Speech-to-chat + translate | client SpeechRecognition | — | optional **NEW** `chat_translate` LLM RPC | S (opt) |

### 3.2 Lobby & table creation — routes `/lobby`, `/table/new`, `/multi-table`, `/premium-table`, `/stakes`

Add **framer-motion** (port HRC `motion`/`AnimatePresence` verbatim); reserve **gsap** for the table-preview sweep.

| Screen | Route | Look | Wire | Effort |
|---|---|---|---|---|
| **Lobby** (1770 ln) | rewrite `/lobby` | mode gate + cards → `GLASS_PANEL`+`BTN_GOLD`, cyan/gold bokeh; extend `TableCard.tsx`; procedural felt from `textures.ts` | grid/hot/quick ← `table_list` (exists, 5s poll); **filters need NEW label extension** (variant/format/blinds/buy_in/is_private/player_count); create → `/table/new` or `createRoom`→`table_create`; quick-match ← `matchmaker_enqueue`; join-code ← `room_resolve`; bots ← `table_add_bot`; tourney ← `tournament_list`; clubs ← `club_list`. **NEW**: private-password join, `table_delete`, missions strip, club-activity feed, fast-fold pool browser, SNG/Spin&Go/HU/Bomb quick-create | L |
| **Table Setup** (1520 ln, 8-step) | new `/table/new` | wizard → `GLASS_PANEL`, cyan/gold stepper; **live mini R3F preview** (marquee upgrade) replaces HRC SVG | launch → `table_create` (map fields; BB tier-capped); theme ← `cosmetic_list {table}`+`inventory_list`+`cosmetic_equip`; **NEW** request fields (private+password, format, timers, ante/straddle/RIT/bomb, approval/spectators/club-only, buy-in range) + engine enforcement; Short-Deck/PLO-5 NEW engine ranks. Ship wizard now, wire fields as backend lands | L |
| **Multi-Table** (392 ln) | new `/multi-table` | tabs+cells `GLASS_PANEL`, cyan active ring | `maxTables` ← `subscription_status.tier.multi_table_limit`; picker ← `table_list`; **VERIFY** concurrent match sockets before per-cell `<GameProvider matchId>` (see §D — else iframes); add `?match=&compact=1` mode | M |
| **Premium Table** (440 ln) | new `/premium-table` (or `?premium=1`) | **real** `CinematicTable` R3F; full-body `Character3DGL` + portrait fallback; `SeatHud`+`stackDisplay` | gate ← `subscription_status`+`me_verification`; CTA → `subscription_checkout`; live over match socket via `GameProvider`; admin ← `OpHostAction`; **NEW** waitlist sidebar (`poker_table_waitlist`) | M |
| **Stakes** (395 ln) | new `/stakes` | cards/modals `GLASS_PANEL`, palette status chips | tourney select ← `tournament_list`; **everything else NEW** — `poker_stake_offer`/`_holding` + `stake_offer_create`/`stake_browse`/`stake_action`/`stake_settle`; settlement hooks tournament finish | M |

### 3.3 Hand replay & provably-fair — routes `/replay/[matchId]/[handNo]`, `/r/[token]`, `/provably-fair`, `/explorer`

Reconstruct replay server-side from the audit chain; nothing new on the write side.

| Screen | Route | Look | Wire | Effort |
|---|---|---|---|---|
| **HandReplay** (3D scrubber) | new `/replay/[matchId]/[handNo]` (+`/replay?match=&hand=` redirect) | replace 2D mini-table with **our R3F scene** (parametrize `proof` `Scene`/`Board`/`Pot`/`SeatPill`/`ActionChip` to accept dynamic data); DOM glass HUD; port `useHandReplayState` | load → **NEW** `hand_replay {match_id,hand_no}` (reconstructed from `audit_list`; interim = client-side reconstruct like `HandHistoryPanel`); verify → `audit_verify_hand` (reuse `HandVerifyPanel`); export JSON client-side; PDF via **NEW dep** `jspdf`; keyboard from `usePokerKeyboard` | L |
| **SharedReplay** (public) | new public `/r/[token]` | pulled-back `CinematicTable` hero, glass feed, gold winner banner | **NEW** `hand_replay_public {token}` (guest-safe, non-revealed hole cards **must** be excluded); **NEW** `hand_share_token` (HMAC, no DB row); OG meta via `generateMetadata`; CTAs → `/replay/…`, `/lobby` | M |
| **ProvablyFair** | enhance existing `/provably-fair` | on-theme; add "Why It Matters" table + live demo | `anchor_status` (exists); **live demo NEW** `features/replay/fairDemo.ts` — WebCrypto reimplementation of our real SHA-256/CTR/Fisher-Yates (byte-for-byte server shuffle), commitment = `SHA-256(seed_bytes)`; compact panel = `HandVerifyPanel` | M |
| **TransactionExplorer** | new `/explorer` | 3-tab pill shell, `Panel` rows, palette badges | Tx(self) ← `wallet_ledger` (client filter/page); Tx(admin) → **NEW** `admin_ledger_search`; withdrawals ← `withdrawal_list`; deposits → **NEW** `deposit_list`; Game Hands → **NEW** `hand_history` over **NEW** `poker_hand_index`; per-hand verify = `audit_verify_hand` + **NEW** `anchor_proof` (Merkle inclusion path); batches → **NEW** `anchor_list`. Admin scope ← `me_roles.platform_admin` | L |
| **BlockchainDashboard** **[critic-added]** | new `/blockchain` (or a tab of `/explorer`) | glass cards: batch/anchor network stats, contract addresses, chain status | reuse `anchor_status`+`anchor_list`+`anchor_proof`; **no fabricated VRF** — VRF stays a roadmap chip, batch-Merkle is the real surface | S / M |

Group note: HRC VRF badges have no analog — we anchor batch Merkle roots to Polygon. Show "Anchored" + inclusion proof, keep VRF on the `/provably-fair` roadmap column. Wallet "types" (main/cash/sng/…) don't exist yet — see §D multi-wallet reconciliation.

### 3.4 Clubs — route family `/clubs`

Shared shell: promote `proof/ClubDashboard.tsx` into `features/clubs/ClubShell.tsx` (248px sidebar + header) wrapping every route. Charts = inline SVG in `features/clubs/charts.tsx` (no chart lib). Motion = GSAP/CSS.

| Screen | Route | Wire (EXISTING / **NEW**) | Effort |
|---|---|---|---|
| **ClubDashboard** | `/clubs` | `club_get`(exists)+**`club_roster`**; overview → **`club_quick_stats`**; tables ← `table_list`+`table_create`; financials ← `rake_ledger_get`+**`club_rake_report`**; leaderboard → **`club_rankings`**; announcements/events → **`club_announcement_list`**/**`club_event_list`**; missions → **missions RPCs**; alliance news → **`alliance_get`**; pending → **`club_requests_list`**/**`club_request_review`** | L |
| **ClubCreate** | `/clubs/create` | `club_create`(exists) + **`club_update`** for tag/visibility/branding/credit-limit; `balance_allocate`(exists); fee ← `club_get`/`wallet_get` | M |
| **BrowseClubs** | `/clubs/browse` | **`club_browse`** (member_count/is_public/created_at); `club_join`(exists); **`club_join_request`**; **`club_invitations_list`** | M |
| **ClubSettings** | `/clubs/[id]/settings` | **`club_update`** (general/branding/tz/lang/financial/security flags); rake ← `rake_config_get`/`set`(exists); **`club_transfer_ownership`**; **`club_delete`**; 2FA/API-key persist-only stubs; anti-collusion flag only (enforcement = §B gap) | L |
| **ClubInvitations** | `/clubs/invitations` | **`club_invite`**; **`club_requests_list`**/**`club_request_review`**; `balance_allocate`(exists) | M |
| **ClubRankings** | `/clubs/rankings` | **`club_rankings`** over **`poker_club_stats`**; intersect `club_list` for "Your Club" | M |
| **Members** | `/clubs/[id]/members` | `club_members`(exists)+**`club_roster`**; `balance_get`(exists); `club_member_role`/`club_kick`(exists); **`club_invite`**; **`stats_head_to_head`**; presence via Nakama SDK **or** **`club_presence`** (§D — decide) | L |
| **ClubRevenueReports** | `/clubs/[id]/revenue` | **`club_rake_report {period}`** over `rake_ledger`; alerts ← `club_event_list`/`tournament_list`; chat → **`club_chat_send`/`_list`** (or Nakama channel — §D) | M |
| **ClubMemberAnalytics** | `/clubs/[id]/member-analytics` | **`club_member_stats`**; **`club_quick_stats`** trends; `club_roster` avatars | M |
| **ClubTournamentAnalytics** | `/clubs/[id]/tournament-analytics?tournament=` | `prize_pool_list`+`blind_level_list`+`tournament_list`(exists); **`tournament_analytics`**; **`tournament_finalize`**; export client-side | M |

### 3.5 Alliances / Leagues / Club Wars — entirely NEW backend

Routes `/leagues`, `/leagues/[id]`, `/alliances/[id]`, `/club-wars`. Reuse `features/ui` primitives; `callSessionRpc` only; admin gated `me_roles.platform_admin`, club-scoped by `requireClubConfigurer`.

| Screen | Route | Wire (all **NEW** unless noted) | Effort |
|---|---|---|---|
| **Leagues** (2-tab hub) | `/leagues` | `alliance_list`, `league_list`, `club_list`(exists); `alliance_create` (configurer), `league_create` (admin) | L |
| **LeagueDetail** | `/leagues/[id]` | `league_get`, `league_update`, `league_standings_set` (admin override), `league_complete`, `league_delete`, `league_join`; **`accrueLeaguePoints`** match-loop hook auto-populates standings | L |
| **AllianceDetail** | `/alliances/[id]` | `alliance_get`, `alliance_update`, `alliance_join`, `alliance_remove_club`, `alliance_delete`, `club_alliance_get`; my clubs ← `me_roles`+`club_list`(exists) | M |
| **ClubWars** (3-state) | `/club-wars` | `clubwar_list`, `clubwar_get`, `clubwar_schedule`, `clubwar_accept`, `clubwar_matchmake` (admin), `clubwar_result`; scores real via **club-war settlement hook** in `pollPendingShowdown` writing `poker_club_war_hand`; ELO recomputed at war end | L |

### 3.6 Tournaments — routes `/tournaments`, `/tournaments/new`, `/tournaments/[id]`

Keep our working `BlindClock` + `tournament_*`/`blind_level_*`/`prize_pool_*` wiring; split into three routes. Add **gsap**.

| Screen | Route | Wire | Effort |
|---|---|---|---|
| **MTT Lobby** | `/tournaments` (reskin) | list ← `tournament_list`(exists); register → `tournament_register`; **NEW** `registered_count`+derived `prize_pool_minor` on rows (else count `—`, hide progress bar) | M |
| **Tournament Builder** (4-tab) | new `/tournaments/new` | fans out to EXISTING: `tournament_create`→`blind_level_add`(loop)→`prize_pool_add`(loop)→`balancing_rule_set`; **NEW** cols for late-reg, reg-close, time-bank, auto-away, admin-fee, payout-preset, short-deck | L |
| **TournamentDetail** (live + standings + analytics) | new `/tournaments/[id]` | `blind_level_list`/`prize_pool_list`/`tournament_start`(exists); reuse `BlindClock`; **NEW** `tournament_status` (remaining/total, per-table counts, chip standings, eliminations) — until then fall back to config view; pie = dependency-free inline SVG (no recharts) | L |

### 3.7 Wallet, Shop, Marketplace, Cosmetics — routes `/wallet`, `/shop`, `/marketplace`, `/dye`, `/wardrobe`, `/avatar-customizer`

Reuse `/membership`, `/marketplace`, `/studio` handlers as canonical. **[critic-confirmed]** `AvatarCustomizer.tsx` and `AvatarWardrobe.tsx` and `DyeShop.tsx` are IN this group — designed below, not dropped.

| Screen | Route | Wire | Effort |
|---|---|---|---|
| **Wallet** (Cashier) | new `/wallet` | total ← `wallet_get`; **multi-wallet is a decision — see §D**; history ← `wallet_ledger`; deposit → `wallet_deposit_fiat`/`_crypto` (hosted invoice; raw address/QR replaced); withdraw → `wallet_withdraw`+`withdrawal_list`; limits ← `subscription_status`+`me_verification` | L (multi-wallet) / M (single-wallet) |
| **Shop** | new `/shop` | catalog ← `cosmetic_list`; owned ← `inventory_list`; buy → **NEW** `cosmetic_buy`; equip → `cosmetic_equip`; bonus ← `daily_bonus_*`; wishlist → **NEW** `cosmetic_wishlist_*`; **NEW** cosmetic kinds (frame/seat_effect/win_celebration/entrance_animation) | L |
| **Marketplace** (P2P + NFT) | rebuild `/marketplace` | browse/buy/list/cancel EXISTING; fee preview client-side from `subscription_tiers`; ETH/NFT path → **NEW** `cosmetic_mint_nft`/`_status` (else disabled "coming soon") | M |
| **DyeShop** **[critic-confirmed in-group]** | new `/dye` | live recolor of equipped ring/glow (`avatars.ts`) + GLB tints; **NEW** `cosmetic_dye_get`/`_set` + `poker_cosmetic_dye` + snapshot dye params | M |
| **AvatarWardrobe** **[critic-confirmed in-group]** | new `/wardrobe` | grid ← `cosmetic_list {model}`+`avatars.ts`; equip → `cosmetic_equip`; **NEW** `loadout_save`/`_list`/`_equip` + `poker_loadout` + gear-slot kinds (else read-only slots) | M–L |
| **AvatarCustomizer** **[critic-confirmed in-group]** | new `/avatar-customizer` (or fold into `/studio`) | render → `character_generate` (Tripo, real); poll `character_generation_status`; apply → `cosmetic_equip`. Backend EXISTS | S–M |

### 3.8 Loyalty, tiers, missions, analytics, profile — routes `/loyalty`, `/membership`, `/leaderboard`, `/analytics`, `/profile`

Shared NEW: `features/analytics/charts.tsx` (inline SVG), `features/loyalty/NumberTicker.tsx` (RAF).

| Screen | Route | Wire | Effort |
|---|---|---|---|
| **LoyaltyDashboard + Loyalty** **[critic: two HRC screens → one route, both covered]** | enhance `/loyalty` | hero/ladder/achievements ← `loyalty_get`(exists); streak ← `daily_bonus_*`; rakeback ← `rakeback_*`; earnings feed → **NEW** `loyalty_history` (HRP-per-event persistence) | M |
| **Tiers** | reuse `/membership` | `subscription_tiers`/`subscription_status`/`subscription_checkout`/`kyc_status`/`me_verification`/`kyc_start` (all exist); add per-tier limits table + accent ring | S |
| **PremiumUpgrade** | new thin `/membership/upgrade` | client `router.replace("/membership")`; no backend | S |
| **Leaderboard** **[critic-added — global player ladder]** | new `/leaderboard` + Command Center entry | **NEW** `leaderboard_top {metric,period,limit}` wrapping `nk.LeaderboardRecordsList`(+owner); backend already writes native leaderboards via `social/social.go` | M |
| **Analytics (personal)** | new `/analytics` | **NEW** `player_stats`; **NEW** `hand_history`; charts via new SVG set; coaching ← `coaching_tip`/`leak_report` | M |
| **Profile** **[critic-added]** | new `/profile` (own) + `/u/[id]` (public) | `profile_get`(exists) + `player_stats`(NEW) + `loyalty_get`; edit → **NEW** `profile_update` | M |

### 3.9 Admin, compliance, marketing, account — **[critic-added: entirely uncovered HRC screens]**

| Screen | Route | Wire | Effort |
|---|---|---|---|
| **AdminDashboard** | new `/admin` (gated `me_roles.platform_admin`) | home tiles + nav to sub-consoles; **NEW** `admin_overview` (user counts, GGR, active tables), user management **NEW** `admin_user_search`/`admin_user_update`, feature flags **NEW** `admin_flags_get`/`_set` | L |
| **Analytics (platform-wide)** | new `/admin/analytics` | **NEW** `admin_platform_stats` (revenue, DAU, hands, rake — distinct from club analytics) | M |
| **AnnouncementManager** | new `/admin/announcements` | **NEW** `announcement_create`/`announcement_update`/`announcement_list` (admin CRUD; drives in-game breaking-news modal) | M |
| **ResponsibleGambling** | new `/responsible-gambling` | **NEW** `rg_limits_get`/`rg_limits_set` (deposit/loss/session), `rg_cooloff`, `self_exclude`; **enforcement hooks** in wallet deposit + match-loop seat gate (§B) | L |
| **Security** | new `/security` | **NEW** `security_2fa_enroll`/`_verify`/`_disable`, `security_sessions_list`/`_revoke`, `security_password_change` | M |
| **AccountRecovery** | new `/recover` | **NEW** `account_recover_start`/`_complete` (email token) | M |
| **Landing** | our root `/` (`page.tsx`) | marketing hero + dimmed `CinematicTable` backdrop; CTAs → `/lobby`, `/membership`; no backend; guest→signup path (§E) | M |
| **Support** | new `/support` | **NEW** `support_ticket_create`/`support_ticket_list` (+ `poker_support_ticket`) | M |
| **ApiDocs** | new `/api-docs` (or intentionally dropped) | static; **call-out: drop unless dev program planned** | S |
| **Terms / Privacy** | new `/terms`, `/privacy` | static legal MDX; trivial but required | S |
| **Login / Register / Onboarding** **[critic §E]** | existing `/login` + new `/register`, `/onboarding` | **must be designed** — every RPC assumes an authed Nakama session; wire Nakama auth (device/email); SharedReplay "Play Now" lands here | M |

### 3.10 Inventory features needing a home — **[critic §B]**

| Feature | Decision | Route / Wire |
|---|---|---|
| **Achievements** | Build (already partly in `loyalty_get.achievements`) | surface on `/loyalty`; **NEW** `achievements_list` if standalone detail wanted |
| **Battle Pass** | **Phase 4 / owner decision** — new season model | new `/battle-pass`; **NEW** `battlepass_status`/`_claim` + `poker_battlepass_*`. Flag as scope-add, not silently built |
| **Referrals** | Build (growth lever) | new `/referrals`; **NEW** `referral_code_get`/`referral_attribute`/`referral_payout` + `poker_referral` |
| **Collusion / anti-cheat** | **Explicitly deferred** — `antibot_score` exists, no review UI. Note in plan; do not fake a surface | admin review screen = out of scope this cycle |
| **Bot AI config** | **Decide now: DROP the raw-key panel.** Our bots are server heuristic via `table_add_bot`. Optional `bot_config_set/get` only if LLM personalities are approved | — |
| **RG enforcement hooks** | In scope with the RG screen (§3.9) | wallet + match-loop |

---

## 4. Consolidated NEW-BACKEND workplan (deduped, ordered)

> Every `newBackend` item across all groups, merged. Conflicting/duplicate specs reconciled once (flagged). Order = dependency + phase. `main.go` currently registers ~78 RPCs (lines 31–109) — **all new RPCs register there**.

### 4.0 Reconciliations (resolve BEFORE building — §C conflicts)

- **`poker_hand_stats` — ONE table, unified schema.** Defined 3× (in-game analytics, clubs, replay). Canonical columns: `(user_id, club_id, match_id, hand_no, vpip bool, pfr bool, went_to_showdown bool, won bool, net_cents, contribution_cents, street_reached, opponents_json, created_at)`. Superset of all three. Single writer.
- **Missions — ONE system.** In-game, Clubs, and Lobby each referenced missions. Canonical: `poker_mission`/`poker_mission_progress` + `missions_list`/`mission_claim`/`missions_generate_daily`. Clubs "challenges" read the same tables scoped by club.
- **Insurance / Run-it-twice / Bomb-pot — spec each opcode ONCE.** They appear in both in-game and lobby/setup groups. `OpInsuranceOffer`/`OpInsuranceAccept`, `OpRunItTwice`, `OpBombPot` have a single payload definition each; TableSetup toggles and in-game panels consume the same opcode.
- **Multi-wallet — DECISION REQUIRED (§D).** Wallet screen wants 5 buckets + transfer; Explorer says single global wallet. **Recommended: ship single-wallet first** (Wallet screen renders one "Main" balance, hides transfer/allocation), and treat `poker_wallet_bucket`/`wallet_balances`/`wallet_transfer`/deposit-allocation as a **Phase 4 opt-in** behind owner sign-off. Do not build the transfer UI against a non-existent ledger model.
- **One unified match-loop attribution hook (§D).** `accrueLeaguePoints`, club-war attribution, mission progress, `poker_hand_stats` write, `poker_hand_index` write, `poker_club_stats`/`poker_club_war_hand` rollups all bolt onto `pollPendingShowdown`/`emitHandSettled`. **Build a single `attributeHand()` settlement hook** that fans out to all counters with one batched DB write — not four independent hot-path writes.

### 4.1 Store tables (new / altered)

| # | Table | One-line spec |
|---|---|---|
| T1 | `poker_hand_stats` | Unified per-user/club/hand stat rows (see 4.0); written by `attributeHand()`. Powers analytics, opponent HUD, H2H, club stats, hand_history. |
| T2 | `poker_hand_index` | `(id,match_id,room_id,table_label,hand_no,user_ids_json,winner_seats_json,pot,rake,deck_commit,anchored,anchor_tx,created_at)`; listable hands without scanning audit chain. Backs `hand_history`. |
| T3 | `poker_club_stats` | Per-club rollup (member_count, active_7d, hands, win_rate, chips_won, tourney_wins). Backs `club_rankings`/dashboard. |
| T4 | `poker_club` **ALTER** | +is_public, require_approval, tag, avatar_url, theme_color, timezone, language, max_buyin_cap_cents, default_credit_limit_cents, require_2fa, anti_collusion, deleted_at. |
| T5 | `poker_club_invitation` | `(id,club_id,user_id,inviter,type invite|request,role,credit_limit_cents,status,created_at)`. |
| T6 | `poker_club_announcement` | `(id,club_id,title,body,severity,created_by,created_at)`. |
| T7 | `poker_club_event` | `(id,club_id,name,scheduled_at,small_blind,big_blind,variant,format,created_by)`. |
| T8 | `poker_club_chat` | `(id,club_id,user_id,text,created_at)` — OR reuse Nakama per-club channel (§D decide). |
| T9 | `poker_alliance` + `poker_alliance_member` | Alliance + members; unique `club_id` (a club ∈ ≤1 alliance). |
| T10 | `poker_league` + `poker_league_standing` | Season + per-club standings; optional native Nakama leaderboard per season. |
| T11 | `poker_club_war` + `poker_club_war_hand` + `poker_club_rating` | War state + per-hand deltas + club ELO (default 1200). |
| T12 | `poker_insurance` | `(match_id,hand_no,user_id,premium,payout)`. |
| T13 | `poker_stake_offer` + `poker_stake_holding` | Staking marketplace escrow via `WalletStore`. |
| T14 | `poker_mission` + `poker_mission_progress` | Unified daily/weekly challenges + per-user progress. |
| T15 | `poker_table_waitlist` | `(match_id,user_id,requested_at,buy_in)`; auto-offer next seat (§D — real seating-state change). |
| T16 | `TournamentBracket` **ALTER** | +late_registration, registration_close_offset_secs, time_bank_secs, auto_away, admin_fee_bps, payout_preset, short_deck variant. |
| T17 | `poker_cosmetic_wishlist` | `(user_id,cosmetic_id,created_at)`. |
| T18 | `poker_cosmetic_dye` | `(user_id,cosmetic_id,params_json,updated_at)`. |
| T19 | `poker_loadout` | `(id,user_id,name,slots_json,created_at)` multi-slot outfits. |
| T20 | `poker_cosmetic` **seed/ALTER** | seed kinds frame/seat_effect/win_celebration/entrance_animation + gear slots; +token_id/chain/contract/tx_hash/minted_at for NFT. `kind` is free-text — no migration. |
| T21 | `poker_announcement` | `(id,title,body,severity,starts_at,ends_at,audience)` platform MOTD. |
| T22 | `poker_replay_share` | OPTIONAL `(id,match_id,hand_no,owner,created_at)` — or stateless HMAC token (preferred, no row). |
| T23 | `poker_wallet_bucket` | **DEFERRED (§4.0)** multi-wallet buckets. Build only on owner sign-off. |
| T24 | `poker_referral` **[critic]** | codes + attribution + payout. |
| T25 | `poker_support_ticket` **[critic]** | support/ticketing. |
| T26 | `poker_rg_limits` + `poker_self_exclusion` **[critic]** | responsible-gambling limits + exclusion windows. |
| T27 | `poker_battlepass_*` **[critic, Phase 4 opt-in]** | season/tier progression. |

### 4.2 Match opcodes / match-loop changes (protocol/opcodes.go + handler.go)

| # | Change | Spec |
|---|---|---|
| O1 | **`attributeHand()` unified settlement hook** | Single sibling of `emitHandSettled`/`accrueLoyalty` in `pollPendingShowdown`; fans out to hand_stats, hand_index, club_stats, league standings, club-war deltas, mission progress — one batched write. **Foundational** — build first. |
| O2 | `OpInsuranceOffer` / `OpInsuranceAccept` | All-in insurance offer {equity,premium,payout} + accept/decline; settle + house bankroll around `beginShowdownResolution`. |
| O3 | `OpRunItTwice` + multi-board `OpShowdown` | Per-seat 1×/2×/3× votes; `showdown_async.go` deals N runouts, splits pot; extended showdown payload. |
| O4 | `OpBombPot` + bomb-pot engine | Host subcommand/table param; everyone antes, deal straight to flop. `poker/table.go` change. |
| O5 | `OpSitOut` / `OpSitIn` / `OpRebuy` | Sit-out (keep seat) / sit-in; mid-session top-up from wallet/club balance. |
| O6 | private-table password + seating gates | Hashed table password enforced at `MatchJoinAttempt`/`OpSitDown`; +allow_spectators, club_members_only, require_admin_approval. |
| O7 | straddle support | `poker/table.go` optional straddle post; advance first-action. |
| O8 | turn-timer / time-bank enforcement | Wire per-table `turn_timer_secs`/`time_bank_secs` into action clock. |
| O9 | dye params in snapshot | Extend `equippedModelURL`/`TableSnapshot SeatView` + `protocol/messages.go` to carry primary/secondary/accent; no new opcode. |
| O10 | `war_id` match param + club-war attribution | New match label/param; `pollPendingShowdown` attributes hands where both seats ∈ warring clubs → `poker_club_war_hand`, live score. (Folded into O1.) |
| O11 | director late-reg / time-bank / auto-away | `match/tournament/director.go` honors reg-close cutoff + late entry; handler applies time-bank/auto-away on tournament tables. |
| O12 | fast-fold pool director | **Heavy** — new pooled match module that instantly reseats folders across a shared pool (§D — multi-week, not an RPC). |
| O13 | SNG / lottery-SNG / heads-up auto-start | `format` column + auto-start-on-fill in director; randomized prize multiplier for Spin&Go. |
| O14 | mission progress accrual | Folded into O1. |
| O15 | RG enforcement hooks **[critic]** | Deposit-limit check in wallet; loss/session-limit + self-exclusion seat gate in match-loop. |

### 4.3 Engine-math (rs_poker sidecar) changes

| # | Change | Spec |
|---|---|---|
| E1 | multi-board runout | Evaluate N independent board runouts, return per-board winners/categories for pot split (run-it-twice/multiple). Touches sidecar contract. |
| E2 | short-deck ranks | 36-card ranking (flush > full house reorder). Real evaluator change (flagged S/M but is engine work). |
| E3 | PLO-5 ranks | 5-card-hole Omaha evaluation. |

### 4.4 New RPCs (register in `main.go`)

**Stats / replay / explorer**
- `player_stats {user_id?}` → aggregated VPIP/PFR/AF/WTSD/net over `poker_hand_stats`.
- `hand_history {match_id?,user_id?,on_chain_only?,limit,offset}` → per-hand index rows.
- `stats_head_to_head {opponent_user_id,club_id?}` → H2H record.
- `leak_report` → aggregates through `gto_advise`.
- `hand_replay {match_id,hand_no}` → reconstructed replay (session).
- `hand_replay_public {token}` → guest replay, non-revealed hole cards excluded.
- `hand_share_token {match_id,hand_no}` → `{token,url}` (HMAC, no row).
- `replay_share` (optional) → shareable link.
- `deposit_list {limit?,offset?}` → caller deposits (admin-all gated).
- `anchor_proof {match_id,hand_no}` → Merkle inclusion path + explorer_url (needs `MerklePath` helper).
- `anchor_list {limit?,offset?}` → paginated anchored batches.
- `admin_ledger_search {query?,type?,from?,to?,limit,offset}` (admin) → cross-user ledger.
- `leaderboard_top {metric,period,limit}` → wraps Nakama leaderboard reads.
- `loyalty_history` → HRP-per-event feed.
- `profile_update` **[critic]** → edit own profile.

**Clubs / alliances / leagues / wars**
- `club_update`, `club_delete`, `club_transfer_ownership`, `club_browse`, `club_roster`, `club_rankings`, `club_rake_report {period}`, `club_member_stats`, `club_quick_stats`, `club_presence` (or Nakama SDK — §D).
- `club_invite`, `club_join_request`, `club_requests_list`, `club_request_review`, `club_invitations_list`.
- `club_announcement_list`/`club_announcement_create`; `club_event_list`/`club_event_create`; `club_chat_send`/`club_chat_list`.
- `alliance_create`/`_list`/`_get`/`_update`/`_join`/`_remove_club`/`_delete`; `club_alliance_get`.
- `league_create`/`_list`/`_get`/`_update`/`_delete`/`_standings_set`/`_complete`/`_join`.
- `clubwar_schedule`/`_list`/`_get`/`_accept`/`_matchmake`/`_result`.

**Tournaments**
- `tournament_status {tournament_id}` → live remaining/total, per-table counts, standings, eliminations.
- `tournament_list` **extend** → +registered_count, +derived prize_pool_minor (or new `tournament_get`).
- `tournament_analytics {tournament_id}` → financial overview + progress + summary.
- `tournament_finalize {tournament_id}` → settle payouts, mark completed (load-bearing — §D).

**Lobby / tables / staking**
- `table_create` **extend** → private+password, format, timers, ante/straddle/RIT/bomb, approval/spectators/club-only, buy-in range, theme.
- `table_list` **extend** → variant/format/blinds/buy_in/is_private/player_count/max_players/host_user_id in label (verify label limits — §D).
- `table_delete {match_id}` (host-only).
- `stake_offer_create`/`stake_browse`/`stake_action`/`stake_settle` (settlement hooks tournament finish).
- `missions_list`/`mission_claim`/`missions_generate_daily`.
- `fastfold_pools_list`/`fastfold_pool_join` (backed by O12).
- `announcement_list`/`announcement_create` **[critic AnnouncementManager]**.

**Wallet / shop / cosmetics**
- `cosmetic_buy {cosmetic_id}` → debit wallet, grant to inventory.
- `cosmetic_wishlist_list`/`_add`/`_remove`.
- `cosmetic_dye_get`/`cosmetic_dye_set`.
- `loadout_save`/`loadout_list`/`loadout_equip`.
- `cosmetic_mint_nft`/`cosmetic_nft_status` + ETH settlement (reuse `integrations/polygon.go` signer).
- **DEFERRED (§4.0):** `wallet_balances`, `wallet_transfer`, deposit-allocation.

**Integrations / AI**
- `commentary_generate {match_id,hand_no}` (+ `OpCommentary`) + `integrations/tts.go`.
- `hand_analyze` (optional LLM narrative) — falls back to `coaching_tip.rationale`.
- `video_token {match_id}` + `integrations/daily.go`.
- `chat_translate` (optional LLM).

**Admin / compliance / account [critic §3.9/§B]**
- `admin_overview`, `admin_user_search`, `admin_user_update`, `admin_flags_get`/`_set`, `admin_platform_stats`.
- `rg_limits_get`/`rg_limits_set`, `rg_cooloff`, `self_exclude`.
- `security_2fa_enroll`/`_verify`/`_disable`, `security_sessions_list`/`_revoke`, `security_password_change`.
- `account_recover_start`/`_complete`.
- `support_ticket_create`/`support_ticket_list`.
- `referral_code_get`/`referral_attribute`/`referral_payout`.
- `bot_config_set`/`get` — **optional; recommend DROP** (map AI-bots panel to existing `table_add_bot`).

---

## 5. Phased sequence

### Phase 1 — Cinematic table live on Nakama (the foundation)
- Add `zustand` (table/UI store) + `gsap`.
- Promote `proof/CinematicTable.tsx` + `textures.ts` → `features/table3d/`, parametrized to accept live data (lift `Scene`/`Board`/`Pot`/`SeatPill`/`ActionChip` off `PROOF_*` constants).
- Feed it from `useGame()` `snapshot`/`holeCards`; renderer switch (2D Pixi / 3D R3F / MIX) via extended `renderMode.ts`.
- Restyle ActionBar/PreActionBar/slider/chat/taunts/showdown to tokens; all 2.5D/3D/mix avatar paths render and switch.
- **Exit gate:** a real Nakama hand drives the R3F table end-to-end; every on-screen control fires a real opcode.

### Phase 2 — Glass component kit + club / economy / progression screens
- Build `features/ui` kit coverage, `features/clubs/ClubShell.tsx` + `charts.tsx`, `features/analytics/charts.tsx`, `features/loyalty/NumberTicker.tsx`; add `framer-motion` for lobby/creation.
- Screens: Lobby, Table Setup (live mini R3F preview), Multi-Table (after socket verification), Premium Table, Clubs (all 10), Tournaments (3 routes), Wallet (single-wallet), Shop, Marketplace, Dye, Wardrobe, Avatar Customizer, Loyalty, Tiers, Leaderboard, Analytics, Profile.
- Backend: `attributeHand()` hook (O1) + T1/T2/T3, all club/tournament/cosmetic/stats read RPCs, `table_create`/`table_list` extensions, `tournament_status`/`_finalize`.
- **Exit gate:** every economy/club/progression screen renders live data; no dead buttons.

### Phase 3 — Social / admin / AI + heavier backend
- Insurance, Run-it-twice, Bomb-pot, Sit-out/in/Rebuy (O2–O5) + engine-math E1/E2/E3.
- Alliances / Leagues / Club Wars (full new backend), Stakes, Missions, Fast-fold pool (O12 — scope as multi-week), Commentary+TTS, Video, AI-analysis/coaching.
- Admin console + AnnouncementManager + platform analytics + explorer/blockchain.
- **Exit gate:** social + admin surfaces live; each new RPC has a smoke test.

### Phase 4 — Compliance / marketing / polish
- ResponsibleGambling (+ enforcement hooks O15), Security, AccountRecovery, Login/Register/Onboarding (§E), Landing, Support, Terms/Privacy.
- Owner-decision opt-ins: multi-wallet (T23/deferred RPCs), Battle Pass, Referrals, NFT mint.
- Motion polish (GSAP choreography), `prefers-reduced-motion` audit, PDF export, OG unfurl.
- **Exit gate:** regulatory surfaces present, guest→signup path closed, full build clean.

---

## 6. Verification

**Per-screen (every route):**
- Headless render (Playwright) each route at desktop + mobile widths; assert no console errors, no horizontal body scroll, dark-only theme, tokens applied (`GLASS_PANEL` present, no stray HRC `#d4af37` inline styles).
- Assert **no dead buttons**: every interactive control has a bound handler that calls a registered RPC or opcode (lint pass + runtime smoke).
- Avatar preset switch (2d/3d/mix) toggles and persists on every table-bearing screen.

**Build / type:**
- `cd frontend-table && npm install && npm run build` — clean, zero type errors, Pixi/R3F never SSR-imported.
- `cd backend-core && go vet ./... && go build -buildmode=plugin -trimpath -o backend-core.so .` — clean (ignore expected `function main is undeclared` on plain `go build ./...`).
- `cd engine-math && cargo build && cargo test` — green (covers E1/E2/E3 multi-board/short-deck/PLO-5).
- Nakama⇄nakama-common pin unchanged (3.31.0 ⇄ v1.41.0) unless bumped together.

**Live integration:**
- Boot the stack (Railway `railway config apply` or local Docker) and play a full hand: deal → betting rounds → showdown drives the **R3F cinematic table** with correct pot/stacks/board/winner sweep, all text in DOM.
- Renderer cross-fade Pixi↔R3F mid-session with no state drift (assert rendered pot/stacks == server snapshot).
- Provably-fair: `fairDemo.ts` WebCrypto shuffle matches `audit_verify_hand` byte-for-byte for a live hand.
- SharedReplay opened logged-out returns no un-revealed hole cards (payload assertion).

**Per new RPC — smoke test (Go test / scripted `callSessionRpc`):**
- Each of the ~90 new RPCs in §4.4 has a smoke test asserting: registered in `main.go`, correct auth gate (session / configurer / `platform_admin`), happy-path shape, and one failure path (unauthorized / insufficient funds / not-found).
- `attributeHand()` (O1): after one showdown, assert exactly one batched write populated hand_stats + hand_index + all active rollups (league/war/mission/club) — no N-fold duplicate hot-path writes.
- Match opcodes O2–O8: scripted match-socket test per opcode (insurance offer/accept, RIT vote/split, bomb-pot ante-to-flop, sit-out/in/rebuy, password join, straddle, timer/time-bank).

**Risk gates that must be resolved before their phase ships (from §D):**
- Multi-table: verify one Nakama socket cannot multiplex matches **before** committing per-cell `<GameProvider>` (else iframes).
- `table_list` label extension: verify Nakama match-label size/queryability limits carry all filter fields.
- Fast-fold: re-estimate as a match module (multi-week), not an RPC.
- `tournament_finalize`: prove the director payout/finish path before attaching the analytics screen.
- Commentary omniscient flag + `hand_replay_public`: hole-card exposure gate is **server-side only** — audited, never client-trusted.