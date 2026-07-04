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
