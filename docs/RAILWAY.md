# Deploy on Railway (config synced in repo)

Skip local Docker. This repo contains everything Railway needs:

| Path | Purpose |
|------|---------|
| `.railway/railway.ts` | **Full project** — Postgres + 3 services + env wiring (`railway config apply`) |
| `engine-math/railway.toml` | Per-service build/deploy for Rust sidecar |
| `backend-core/railway.toml` | Per-service build/deploy for Nakama |
| `frontend-table/railway.toml` | Per-service build/deploy for Next.js UI |
| `infra/railway/env.example` | Reference variables for manual wiring |
| `.railway/README.md` | Choose Option A (IaC) vs Option B (TOML) |

## Important: how Railway reads config

- **`railway.toml` applies to one service only.** Attaching the repo once does not auto-create all services.
- **Config file path is absolute from repo root**, e.g. `/backend-core/railway.toml` — it does **not** follow the Root Directory setting ([Railway docs](https://docs.railway.com/config-as-code)).
- **`watchPatterns`** in each TOML limit rebuilds to that service folder.

## Option A — One command project setup (recommended)

```bash
railway login
railway link
railway config plan
railway config apply
```

This reads `.railway/railway.ts` and creates:

- PostgreSQL
- `engine-math` (Dockerfile, `/health`)
- `backend-core` (Dockerfile, `/healthcheck`, DB + engine-math URLs)
- `frontend-table` (Railpack, `/`, public Nakama URL for browser)

Do **not** set Config File paths in the dashboard when using IaC.

## Option B — Attach repo per service (TOML)

For each service in Railway:

1. **Root Directory** → service folder (`engine-math`, `backend-core`, or `frontend-table`)
2. **Config-as-code file** → absolute path:

   | Service | Config file path |
   |---------|------------------|
   | engine-math | `/engine-math/railway.toml` |
   | backend-core | `/backend-core/railway.toml` |
   | frontend-table | `/frontend-table/railway.toml` |

3. Add **PostgreSQL** plugin to the project
4. Paste variables from `infra/railway/env.example` (use Railway reference syntax `${{Service.VAR}}`)

Do **not** run `railway config apply` if using TOML — Railway allows only one config source per service.

## Verify

```bash
curl https://<engine-math-domain>/health
curl https://<backend-core-domain>/healthcheck
open https://<frontend-table-domain>/
```

## Local Docker vs Railway

| | Docker Compose | Railway |
|---|----------------|---------|
| Use when | Full offline, OddSlingers submodule | Cloud env, no local containers |
| Config in repo | `docker-compose.yml` | `.railway/railway.ts` + `*/railway.toml` |
| Postgres | Container | Railway plugin |
