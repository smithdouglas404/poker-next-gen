# Local Docker Compose (optional)

> **Railway is the primary deployment path.** See [RAILWAY.md](./RAILWAY.md).
> Use Docker Compose only if you need a fully offline local stack.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2
- Git submodules (for OddSlingers): `git submodule update --init --depth 1 oddslingers`

## Boot core stack

Nakama + engine-math + Next.js UI:

```bash
./scripts/core-up.sh
```

OddSlingers (optional, slow first build):

```bash
./scripts/oddslingers-up.sh
```

Diagnose issues:

```bash
./scripts/doctor.sh
./scripts/stack-status.sh
```

Boot order: `postgres` → `engine-math` (health) → `backend-core` → `frontend-table`.

> **Mac note:** Nakama Postgres binds host port **5433** (not 5432) to avoid
> conflicting with a local Postgres install.

## URLs (local)

| Service | URL |
|---------|-----|
| Command Center | http://localhost:3000 |
| Live stack dashboard | http://localhost:3000/stack |
| Poker table | http://localhost:3000/table |
| Nakama HTTP API | http://localhost:7350 |
| Nakama Console | http://localhost:7351 |
| engine-math | http://localhost:8080/health |
| OddSlingers | http://localhost:8888 |

Tear down (keep data): `docker compose down`  
Tear down + wipe DB: `docker compose down -v`

## backend-core Docker build

On Railway, Nakama builds from `backend-core/Dockerfile` automatically. Locally:

```bash
cd backend-core
docker build -t poker-backend-core .
```
