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
| `oddslingers`    | `./oddslingers`   | Django + React (submodule, reference)   | Upstream OSS poker platform — patterns ported    |
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

oddslingers (submodule) — reference only; see docs/ODDSLINGERS.md.
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- For working on individual services outside containers:
  - Node.js 20+ / npm (frontend)
  - Go 1.25+ (backend)
  - Rust 1.85+ / Cargo (engine)

## Local development — Docker Compose

Boot the whole stack (Postgres → Nakama → Next.js):

```bash
docker compose up --build
```

Boot order is handled for you: `postgres` starts first and is health-checked
(`pg_isready`); `backend-core` waits for it, runs `nakama migrate up`, then
serves; `frontend-table` waits for the backend and runs the Next.js dev server.

Once up:

| Service                | URL                              |
| ---------------------- | -------------------------------- |
| Poker table (frontend) | http://localhost:3000/table      |
| Nakama HTTP API        | http://localhost:7350            |
| Nakama Console         | http://localhost:7351            |

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

## Production deployment — Railway

Each service carries its own `railway.toml`, so create one Railway service per
directory and set the root/config path accordingly:

- **`frontend-table/railway.toml`** — NIXPACKS builder, `npm run build` /
  `npm run start`, restart `ON_FAILURE`.
- **`backend-core/railway.toml`** — Dockerfile builder, health check
  `/healthz`, restart `ALWAYS`. Attach a Railway PostgreSQL plugin and set
  `DATABASE_ADDRESS=user:password@host:port/dbname`.

> **Health-check note:** the `backend-core` manifest requests `/healthz` as
> specified. Nakama's built-in liveness endpoint is `/healthcheck`; a `healthz`
> RPC is also registered (reachable at `/v2/rpc/healthz`). If Railway reports an
> unhealthy deploy, point `healthcheckPath` at `/healthcheck` or expose a proxy
> route mapping `/healthz` → the RPC.

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
