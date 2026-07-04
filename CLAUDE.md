# CLAUDE.md

Guidance for AI coding agents (Claude, Devin, etc.) working in this repository.

## What this repo is

`poker-next-gen` is a hybrid monorepo for a Texas Hold'em poker network. It is
designed to run **locally via Docker Compose** and **deploy per-service on
Railway**. Three first-class services live in their own top-level directories:

- `frontend-table/` — Next.js 15 (App Router, TypeScript, Tailwind) + Pixi.js v8.
- `backend-core/` — Go module compiled as a Nakama runtime **plugin**.
- `engine-math/` — Rust library wrapping `rs_poker`.
- `oddslingers/` — git submodule ([Monadical-SAS/oddslingers.poker](https://github.com/Monadical-SAS/oddslingers.poker)) for reference; UI/engine patterns are ported into `frontend-table` and `backend-core`. See `docs/ODDSLINGERS.md`.

## Golden rules

1. **Do not change pinned versions casually.** The `backend-core` plugin only
   loads into a Nakama server built from the *same* `nakama-common` version.
   The pairing is pinned to **Nakama 3.31.0 ⇄ nakama-common v1.41.0** in both
   `backend-core/go.mod` and `backend-core/Dockerfile`. Bump them together.
2. **Keep the two run targets in sync.** Local dev = `docker-compose.yml`.
   Production = per-service `railway.toml`. A change to build/start behavior
   usually needs updating in both.
3. **Frontend rendering is client-only.** Pixi.js touches WebGPU/WebGL and must
   never be imported during SSR. `src/app/table/page.tsx` is a `"use client"`
   component that lazily `import()`s Pixi inside a `useEffect`.

## Container boot-up workflow

`docker compose up --build` starts three containers with an explicit boot order:

1. **postgres** — PostgreSQL 16. Health-checked with `pg_isready`. Owns the
   `nakama` database (`postgres` / `localdb`).
2. **backend-core** — waits for `postgres: service_healthy`, then
   `docker-entrypoint.sh` runs `nakama migrate up` followed by `nakama` serving
   on 7349/7350/7351. Reads `DATABASE_ADDRESS`
   (`postgres:localdb@postgres:5432/nakama`).
3. **frontend-table** — `node:22-alpine` bind-mounting `./frontend-table`; runs
   `npm install && npm run dev -- -H 0.0.0.0` on port 3000.

All three share the `poker-net` bridge network and address each other by
service name (e.g. the backend reaches Postgres at host `postgres`).

Key URLs: table UI `http://localhost:3000/table`, Nakama API `:7350`, Nakama
console `:7351`.

## Build & verify commands

```bash
# Frontend
cd frontend-table && npm install && npm run build

# Backend (produces the loadable plugin exactly as the server expects)
cd backend-core && docker build -t poker-backend-core .
# or, for a quick local compile check:
cd backend-core && go vet ./... && go build -buildmode=plugin -trimpath -o backend-core.so .

# Engine
cd engine-math && cargo build && cargo test
```

> Note: `go build ./...` (without `-buildmode=plugin`) will report
> `function main is undeclared` — that is expected for a Nakama plugin package
> and not an error. Always build the backend with `-buildmode=plugin`.

## Data model reference (backend-core/models)

- **Private Club Systems:** `Club`, `Owner`, `PlayerAllocatedBalance`,
  `CustomRakeConfiguration`.
- **Global Tournament Matrix:** `TournamentBracket`, `MultiTableBalancingRule`,
  `BlindTimer`, `PrizeDistributionPool`.

These structs carry `json` and `db` tags and are the canonical persistence
schema referenced by RPCs registered in `backend-core/main.go`.
