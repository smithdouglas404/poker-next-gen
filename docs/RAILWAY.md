# Deploy on Railway (skip local Docker)

Local Docker runs **7 containers** (Postgres, Nakama, Rust sidecar, Next.js, plus optional OddSlingers stack). That is useful for full offline dev, but it is not required to use the platform.

**Railway is the intended cloud path:** three services, managed Postgres, public URLs, no Docker Desktop on your Mac.

## Why Docker feels hard here

| Pain | Why |
|------|-----|
| Nakama Go plugin | Must match exact `protobuf` / Nakama version or build fails |
| Boot order | Postgres → engine-math → Nakama → UI, each with healthchecks |
| OddSlingers | Optional 5 extra containers, heavy first build |
| Port conflicts | Mac Postgres on :5432, etc. |

On Railway, each service builds once in the cloud. You set env vars in the dashboard and open URLs.

## Services to create

Create **one Railway project** with **four resources**:

| # | Railway service | Repo root path | Builder |
|---|-----------------|----------------|---------|
| 1 | PostgreSQL | (Railway plugin) | managed |
| 2 | `engine-math` | `engine-math/` | Dockerfile |
| 3 | `backend-core` | `backend-core/` | Dockerfile |
| 4 | `frontend-table` | `frontend-table/` | NIXPACKS |

OddSlingers is **not** on Railway for this stack — it is reference/submodule only. The live product is Next.js + Nakama + rs_poker.

## Step-by-step

### 1. PostgreSQL

- Add **PostgreSQL** to the project.
- Railway exposes `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGPORT`, `PGDATABASE`.

### 2. engine-math

- New service → connect repo → set **Root Directory** to `engine-math`.
- Uses `engine-math/railway.toml` + `Dockerfile`.
- After deploy, note the public URL (for browser checks) and private hostname `engine-math.railway.internal`.

### 3. backend-core (Nakama)

- New service → **Root Directory** `backend-core`.
- Variables (reference `infra/railway/env.example`):

  ```
  DATABASE_ADDRESS=${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
  ENGINE_MATH_URL=http://engine-math.railway.internal:8080
  ```

- Health check: `/healthcheck` (set in `backend-core/railway.toml`).
- Public URL is your Nakama API (port 7350 inside the container).

### 4. frontend-table

- New service → **Root Directory** `frontend-table`.
- Variables:

  ```
  NEXT_PUBLIC_NAKAMA_HOST=https://<backend-core-public-domain>
  NAKAMA_HOST=http://backend-core.railway.internal:7350
  NAKAMA_SERVER_KEY=defaultkey
  ENGINE_MATH_URL=http://engine-math.railway.internal:8080
  ```

- Deploy → open the Railway-generated URL for the UI (`/table`, `/lobby`, `/stack`).

## Verify

```bash
curl https://<engine-math>/health
curl https://<backend-core>/healthcheck
open https://<frontend-table>/
```

## Local vs cloud

| Goal | Use |
|------|-----|
| Full offline / OddSlingers submodule | `./scripts/core-up.sh` (Docker) |
| Just use the product | **Railway** (this doc) |
| Fix protobuf / plugin build errors | Pull latest `main`, redeploy `backend-core` on Railway |

## Monorepo note

Each `railway.toml` lives **inside** its service directory. In Railway service settings, set **Root Directory** to that folder — do not point the whole monorepo at one service.
