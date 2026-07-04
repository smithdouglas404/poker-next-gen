# Poker Next-Gen

A state-of-the-art, multi-service web poker network (Texas Hold'em first). The
repository is a hybrid monorepo that runs locally via Docker Compose **and**
deploys as independent services on [Railway](https://railway.app) using
per-service `railway.toml` manifests.

## Architecture

| Service          | Path              | Stack                                   | Role                                             |
| ---------------- | ----------------- | --------------------------------------- | ------------------------------------------------ |
| `frontend-table` | `./frontend-table`| Next.js 15 · TypeScript · Tailwind · Pixi.js v8 | WebGPU-accelerated poker table renderer          |
| `backend-core`   | `./backend-core`  | Go · Heroic Labs Nakama game server     | Authoritative game/club/tournament orchestration |
| `engine-math`    | `./engine-math`   | Rust library · `rs_poker`               | Hand evaluation / poker mathematics              |
| `oddslingers`    | `./oddslingers`   | Django + React (submodule, **live in compose**) | Full OSS poker platform at :8888                   |
| `postgres`       | (compose only)    | PostgreSQL 16                           | Nakama persistence layer                         |

```
frontend-table (Next.js :3000)
        │  HTTP / WebSocket
        ▼
backend-core (Nakama :7350 API, :7351 console, :7349 gRPC)
        │  SQL
        ▼
postgres (:5432)

engine-math (Rust) — required rs_poker sidecar (:8080). No Go fallbacks for shuffle or hand eval.

engine-math (Rust) — required rs_poker sidecar (:8080). No Go fallbacks for shuffle or hand eval.

oddslingers (Django + React) — live at :8888; see docs/ODDSLINGERS.md.
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- Git submodules: `git submodule update --init --depth 1 oddslingers`
- For working on individual services outside containers:
  - Node.js 20+ / npm (frontend)
  - Go 1.25+ (backend)
  - Rust 1.85+ / Cargo (engine)

## Local development — Docker Compose

> **Don't want Docker?** Use **[docs/RAILWAY.md](./docs/RAILWAY.md)** — deploy three services + Postgres on Railway, no Docker Desktop.

Boot the **core stack** (rs_poker + Nakama + Next.js):

```bash
./scripts/core-up.sh
```

Boot **OddSlingers** separately (optional, long first build):

```bash
./scripts/oddslingers-up.sh
# or everything: ./scripts/live-up.sh --with-oddslingers
```

If services show down on http://localhost:3000/stack:

```bash
./scripts/doctor.sh
./scripts/stack-status.sh
```

Boot order: `postgres` → `engine-math` (health) → `backend-core` → `frontend-table`; OddSlingers uses compose profile `oddslingers`.

> **Mac note:** Nakama Postgres binds host port **5433** (not 5432) to avoid conflicting with a local Postgres install.

Once up:

| Service                  | URL                              |
| ------------------------ | -------------------------------- |
| Command Center           | http://localhost:3000            |
| **Live stack dashboard** | http://localhost:3000/stack      |
| Poker table              | http://localhost:3000/table      |
| Table lobby              | http://localhost:3000/lobby      |
| Nakama HTTP API          | http://localhost:7350            |
| Nakama Console           | http://localhost:7351            |
| **rs_poker engine-math** | http://localhost:8080/health     |
| **OddSlingers platform** | http://localhost:8888            |

Tear down (keep data): `docker compose down`
Tear down + wipe DB volume: `docker compose down -v`

## Running services individually

### frontend-table

```bash
cd frontend-table
npm install
npm run dev      # http://localhost:3000/table
npm run build    # production build
npm run start    # serve production build
```

### backend-core

The Nakama runtime module is a Go **plugin** (`buildmode=plugin`) and must be
compiled with a Go toolchain/`nakama-common` version matching the Nakama server
(pinned to **3.31.0** / `nakama-common v1.41.0`). Building via the provided
`Dockerfile` guarantees this:

```bash
cd backend-core
docker build -t poker-backend-core .
```

To iterate on the Go code locally:

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
```

## Production / cloud — Railway

**Recommended if local Docker is fighting you.** Step-by-step: **[docs/RAILWAY.md](./docs/RAILWAY.md)**.

Each service carries its own `railway.toml` (set Railway **Root Directory** to that folder):

- **`engine-math/railway.toml`** — Dockerfile builder, health check `/health`.
- **`frontend-table/railway.toml`** — NIXPACKS builder, `npm run build` /
  `npm run start`, restart `ON_FAILURE`.
- **`backend-core/railway.toml`** — Dockerfile builder, health check
  `/healthcheck`, restart `ALWAYS`. Attach a Railway PostgreSQL plugin and set
  `DATABASE_ADDRESS=user:password@host:port/dbname`.

Env var templates: **`infra/railway/env.example`**.

> **Health-check note:** Nakama's built-in liveness endpoint is `/healthcheck` (configured in `backend-core/railway.toml`). A `healthz` RPC is also registered at `/v2/rpc/healthz` for app-level checks.

## Repository layout

```
poker-next-gen/
├── frontend-table/     # Next.js 15 + Pixi.js v8 table renderer
├── backend-core/       # Go Nakama runtime module + Dockerfile
├── engine-math/        # Rust poker-math library (rs_poker)
├── docker-compose.yml  # local multi-container dev stack
├── README.md
└── CLAUDE.md           # container boot-up workflow notes for AI agents
```
