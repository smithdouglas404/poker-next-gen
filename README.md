# Poker Next-Gen

A state-of-the-art, multi-service web poker network (Texas Hold'em first). The
repository is a monorepo deployed on [Railway](https://railway.app) via a single
`.railway/railway.ts` Infrastructure-as-Code file — no local Docker required.

## Quick start — Railway

**Copy-paste guide:** **[docs/DEPLOY.md](./docs/DEPLOY.md)** (4 commands, ~5 min)

```bash
npm install
npm run railway:login    # browser opens — you authorize once
npm run railway:link     # create or pick a project
npm run deploy             # creates Postgres + all 3 services
```

Full walkthrough: **[docs/RAILWAY.md](./docs/RAILWAY.md)**.

## Architecture

| Service          | Path              | Stack                                   | Role                                             |
| ---------------- | ----------------- | --------------------------------------- | ------------------------------------------------ |
| `frontend-table` | `./frontend-table`| Next.js 15 · TypeScript · Tailwind · Pixi.js v8 | WebGPU-accelerated poker table renderer          |
| `backend-core`   | `./backend-core`  | Go · Heroic Labs Nakama game server     | Authoritative game/club/tournament orchestration |
| `engine-math`    | `./engine-math`   | Rust library · `rs_poker`               | Hand evaluation / poker mathematics              |
| `postgres`       | Railway plugin    | PostgreSQL 16                           | Nakama persistence layer                         |
| `oddslingers`    | `./oddslingers`   | Django + React (submodule, optional)    | Reference OSS platform — not on Railway yet      |

```
frontend-table (Next.js)
        │  HTTP / WebSocket
        ▼
backend-core (Nakama :7350 API, :7351 console, :7349 gRPC)
        │  SQL
        ▼
postgres (Railway plugin)

engine-math (Rust) — required rs_poker sidecar (:8080). No Go fallbacks.
```

## Prerequisites

- [Railway CLI](https://docs.railway.com/guides/cli) 5.2+ (for `railway config apply`)
- For working on individual services locally (no containers):
  - Node.js 20+ / npm (frontend)
  - Go 1.25+ (backend plugin compile check)
  - Rust 1.85+ / Cargo (engine)

## Railway config

| Path | Purpose |
|------|---------|
| `.railway/railway.ts` | **One file for the whole stack** — Postgres, services, env vars |
| `infra/railway/env.example` | Reference variables (mirrors IaC wiring) |
| `.railway/README.md` | Short IaC reference |

```bash
railway login && railway link && railway config apply
```

> Nakama healthcheck: `/healthcheck`. App RPC: `/v2/rpc/healthz`.

## Running services individually (local, no Docker)

Useful when editing one service against a Railway-deployed stack, or for unit work.

### frontend-table

```bash
cd frontend-table
npm install
npm run dev      # http://localhost:3000/table
npm run build
npm run start
```

Point env at Railway (or a shared dev environment):

```bash
export NEXT_PUBLIC_NAKAMA_HOST=https://<backend-core-domain>
export NAKAMA_HOST=http://backend-core.railway.internal:7350   # if tunneled/VPN
export NEXT_PUBLIC_ENGINE_MATH_URL=https://<engine-math-domain>
```

### backend-core

The Nakama runtime module is a Go **plugin** pinned to **Nakama 3.31.0** /
`nakama-common v1.41.0`. On Railway it builds from `backend-core/Dockerfile`.

Local compile check only:

```bash
cd backend-core
go vet ./...
go build -buildmode=plugin -trimpath -o backend-core.so .
```

### engine-math

```bash
cd engine-math
cargo build
cargo test
cargo run    # listens on $PORT (default 8080)
```

## Optional — local Docker Compose

Docker Compose is **legacy / optional** for fully offline development. See
**[docs/DOCKER.md](./docs/DOCKER.md)** if you still want containers locally.

## Repository layout

```
poker-next-gen/
├── .railway/railway.ts   # Railway IaC — entire stack
├── frontend-table/       # Next.js 15 + Pixi.js v8 table renderer
├── backend-core/         # Go Nakama runtime module
├── engine-math/          # Rust poker-math library (rs_poker)
├── docs/RAILWAY.md       # Deploy guide
├── docker-compose.yml    # optional local dev only
└── CLAUDE.md             # agent notes
```
