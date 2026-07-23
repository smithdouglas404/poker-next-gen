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

## Golden rules

1. **Do not change pinned versions casually.** The `backend-core` plugin only
   loads into a Nakama server built from the *same* `nakama-common` version.
   The pairing is pinned to **Nakama 3.31.0 ⇄ nakama-common v1.41.0** in both
   `backend-core/go.mod` and `backend-core/Dockerfile`. Bump them together.
2. **Railway is the primary run target.** Production and recommended dev =
   `.railway/railway.ts` (`railway config apply`). Optional local Docker =
   `docker-compose.yml`. Keep build/start behavior aligned when both paths exist.
3. **Frontend rendering is client-only.** Pixi.js touches WebGPU/WebGL and must
   never be imported during SSR. `src/app/table/page.tsx` is a `"use client"`
   component that lazily `import()`s Pixi inside a `useEffect`.
4. **No math fallbacks.** Shuffle, hand rank, showdown, and equity always go
   through `engine-math` (rs_poker). If the sidecar is down, operations fail —
   the Go backend must not silently use local eval or `crypto/rand` shuffles.

## DESIGN-SYSTEM — the guaranteed look (BINDING)

This section is the contract for **all** UI. It is not aspirational styling advice — it is the definition of "done" for anything a player sees. The reference implementation is the cinematic proof under `frontend-table/src/app/proof/` (`CinematicTable.tsx`, `textures.ts`, `proofData.ts`, `ClubDashboard.tsx`, reachable at `/proof` and `/proof?screen=club`). When in doubt, open the proof and match it. Deviating from these values is a defect, not a preference.

### Palette — graphite / red / gold (dark-only)

The theme is **GGPoker red**: obsidian graphite base, GGPoker red primary, gold premium accent. It is **dark-only by design** — do not add a light mode. Canonical tokens live in `frontend-table/src/app/globals.css` (`:root` + `@theme inline`) and must be referenced through the Tailwind theme (`bg-background`, `text-foreground`, `text-brand`, `text-gold`, `font-display`, `font-body`) rather than re-hardcoded:

| Token | Value | Role |
|---|---|---|
| `--background` | `#0b0b0e` | obsidian app base |
| `--foreground` | `#ededf2` | primary text |
| `--brand` | `#e01e2b` | GGPoker red primary |
| `--brand-bright` | `#ff2d3f` | bright red — neon/bloom, `toneMapped={false}` glows |
| `--gold` | `#d4af37` | premium accent |
| `--gold-lite` | `#f3e2ad` | gold highlight / gradient top |
| `--cyan` | `#4a9eb0` | **demoted** — muted teal, verification/provably-fair accent ONLY (not a brand color) |

The `body` background is fixed (`background-attachment: fixed`) and layers two faint radials over the base: red `rgba(224,30,43,0.06)` from top-center and gold `rgba(212,175,55,0.05)` from top-right. Reproduce, do not "improve."

**Scene / 3D palette** (from `proof/CinematicTable.tsx` + `proof/textures.ts`) — these are the exact material colors and are part of the look:
- Scene background & fog: `#05070c` (fog range `[12, 26]`); page gradient base `linear-gradient(180deg,#04060a,#070b12 60%,#04060a)`.
- Felt: radial `#1c7d4e` center → `#0f5f39` → `#053821` edge, plus weave noise (±14) and a `rgba(212,175,55,0.85)` gold inner ring and faint `♦` club mark.
- Gold ring (flat): `#f1cf6b`, emissive `#8a6a1e` @ `0.5`, `metalness 1`, `roughness 0.28`.
- Red neon rim: `#ff2d3f`, `meshBasicMaterial`, `toneMapped={false}` (glow must not be tone-mapped down). This is the table's signature GGPoker-red brand glow.
- Gunmetal outer rail: `#171b22`, `metalness 0.95`, `roughness 0.32`; gold pinstripe `#e9c46a` emissive `#6b501a`.
- Four-color deck (both canvas cards and DOM hero cards): spades `#101317`, hearts `#e5484d`, diamonds `#2f6bff` (blue), clubs `#1fa85a` (green). (The blue diamond is a functional suit color, NOT a brand accent — it stays.)
- Rim lighting: warm white key + **red** accent light (`#ff2d3f`) + **gold** accent light (`#ffcf6a`) + a deep-red back light (`#c8102e`); Environment Lightformers white key + red left rim + gold right rim. Two-tone red/gold — never cyan/purple.
- Action / state tones: active/turn gold `#f3c14b`, **call green `#22c55e`** (kept distinct from all-in red), raise/gold `#e9c46a`, all-in red `#ff3b46` (`#ef4444` for the seat ring), fold/muted `#3a4250`, **idle seat ring neutral steel `#5b6472`** (red is reserved for all-in/danger — idle seats never glow red).

### Typography — Space Grotesk + Manrope

Loaded once in `frontend-table/src/app/layout.tsx` via `next/font/google` and exposed as CSS vars:
- **Display** — `Space_Grotesk`, weights `["500","600","700"]`, var `--font-display`. Used for `h1/h2/h3` and `.font-display`. Headings are uppercase with wide tracking — see `HEADING_LG` (`font-display text-lg font-bold uppercase tracking-wider`) and `HEADING_SM` (`text-[11px] ... tracking-[0.25em] text-neutral-400`) in `tokens.ts`.
- **Body** — `Manrope`, var `--font-body`, is the default `font-family` on `body`.

Do not introduce a third typeface. Section eyebrows/labels are `text-[11px]` uppercase with `tracking-[0.2em]`–`[0.3em]`, matching the HUD.

### Cinematic R3F table architecture (the reference is `proof/`)

The live table is a **React Three Fiber** scene (`@react-three/fiber` v9, `@react-three/drei` v10, `three` 0.171, `@react-three/postprocessing`). It is client-only (`dynamic(... { ssr: false })`, `"use client"`) — never import it during SSR (Golden rule 3). The mandated composition, exactly as in `CinematicTable.tsx`:

- **Felt** — radial-lit green canvas texture (`feltTexture()`), `roughness 0.92`, `metalness 0.02`, on a 128-segment circle scaled `[5.35, 3.55]`.
- **Gunmetal rail** — `torusGeometry`, `#171b22`, high metalness, with a thin emissive **gold pinstripe** torus above it.
- **Gold ring** — flat emissive `ringGeometry` (`#f1cf6b`) inset in the felt.
- **Neon seat rings** — each seat portrait wears a colored ring whose color encodes state (active `#f3c14b`, all-in `#ff3b46`, folded `#3a4250`, idle neutral steel `#5b6472`, else the character's `ring`) with a matching `box-shadow` glow; the felt edge carries the red `#ff2d3f` neon rim.
- **Beveled 4-color cards** — board cards are real `boxGeometry` `[0.66, 0.03, 0.92]` slabs with a per-face material array (white edges, textured top via `cardFaceTexture`, faint `emissiveMap` @ `0.14`). Faces use the four-color deck. Not sprites.
- **Instanced chip stacks** — `ChipStack` renders `cylinderGeometry` chips stacked at `y = i*0.032`; the pot is five colored stacks (`#c9302c`, `#1f2937`, `#2f6bff`, `#e9c46a`, `#1fa85a`). Keep chips as real stacked geometry.
- **Restrained bloom** — `EffectComposer` with `Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.2} mipmapBlur` and `Vignette offset={0.28} darkness={0.82}`. Bloom is subtle and threshold-gated — only true neon/emissive surfaces bloom. Do **not** crank intensity or drop the threshold.
- **Fixed hero camera** — `camera={{ position: [0, 6.9, 7.9], fov: 42 }}`, `ACESFilmicToneMapping`, `toneMappingExposure 1.15`, `dpr={[1,2]}`, `shadows`. The camera is a fixed cinematic hero angle — no free-orbit `OrbitControls` at the live table.
- **Lighting** — warm key `spotLight` (`#fff4d8`, casts shadow) + red/gold accent `pointLight`s (red `#ff2d3f`, gold `#ffcf6a`, deep-red back `#c8102e`) + an `Environment` of three `Lightformer` rects (white key, red `#ff2d3f` left, gold `#ffcf6a` right) + `ContactShadows` (`opacity 0.5`). This red/gold rim lighting is part of the identity.

Seats sit on an ellipse (`SX=4.95`, `SZ=3.2`); seat 0 is the hero at bottom-center.

### Three avatar modes — a player-selectable graphics preset

Character rendering is a **graphics preset the player chooses**, persisted per-device in `frontend-table/src/features/table/renderMode.ts` (`localStorage` key `"poker.render.mode"`; `useRenderMode()` hook + cross-component listeners). All three modes are first-class; the scene branches per-seat on `mode` (`is3d = mode === "3d" || (mode === "mix" && seat.use3d)`):

1. **2.5D — HRC portraits (DEFAULT).** `SeatPortrait2D`: 104×104 circular WebP portrait from `avatarSrc(id)` (`/avatars/<id>.webp`), neon ring + glow + gold owned-badge, rendered via drei `<Html>`. Catalog, rarity tiers, and ring/glow colors are in `src/features/table/avatars.ts` (`AVATARS`, `avatarForKey`, `avatarGradient` fallback). This is the default and must always look intentional even if a portrait 404s (monogram-gradient fallback).
2. **3D — GLB via Tripo.** `GlbFigure`: `useGLTF` GLB (`seat.model` from the Tripo pipeline, else `/models/house.glb`), yawed to face table center, `<Suspense>`-wrapped, name/stack pill floating above via `<Html>`. The premium upgrade.
3. **MIX.** 3D GLB for seats flagged `use3d`, 2.5D portraits for the rest — a mixed table of Tripo characters and HRC portraits.

Note: `renderMode.ts` currently persists `"2d" | "3d"`; `"mix"` is the third selectable value the table honors (`AvatarMode = "2d" | "3d" | "mix"`). Any avatar/graphics work must keep all three paths rendering and switchable — never hard-code one mode.

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

1. **No HTML/CSS faking the cinematic.** The table's 3D look must come from real R3F geometry, materials, lighting, and post-processing — not gradient `div`s or box-shadows pretending to be a 3D table. The proof is the bar.
2. **Glow = hierarchy.** Bloom/glow encodes importance and state (active seat, all-in, premium/gold, red primary). It is threshold-gated and restrained (`Bloom` threshold `0.55`, intensity `0.55`). Never use glow as ambient decoration — if everything glows, nothing does.
3. **State never drifts.** The rendered UI is a pure projection of authoritative server state. No optimistic values that can disagree with the backend, no client-side "guesses" at stacks/pot/turn. Consistent with Golden rule 4 (no math fallbacks): the display reflects server truth or it shows nothing.
4. **Every rendered control binds to a real RPC — no dead buttons.** If a control is on screen (fold/check/call/raise/all-in, presets, host controls, membership, deposits), it is wired to a registered `backend-core` RPC and reflects real capability/permission gating. Ship no placeholder or decorative buttons. The proof uses static demo data precisely because it is a showcase — production surfaces must be live.

## Railway deployment

One file defines the whole stack: `.railway/railway.ts`

```bash
railway login && railway link && railway config apply
```

Creates Postgres + `engine-math` + `backend-core` + `frontend-table` with env
wiring over `*.railway.internal`. Docs: `docs/RAILWAY.md`.

Do **not** add per-service `railway.json` — Railway IaC owns the project.

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
