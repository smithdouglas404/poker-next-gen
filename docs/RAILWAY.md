# Deploy on Railway (config synced in repo)

Skip local Docker. This repo contains everything Railway needs:

| Path | Purpose |
|------|---------|
| `.railway/railway.ts` | **Full project** — Postgres + 3 services + env wiring (`railway config apply`) |
| `engine-math/railway.json` | Per-service build/deploy for Rust sidecar |
| `backend-core/railway.json` | Per-service build/deploy for Nakama |
| `frontend-table/railway.json` | Per-service build/deploy for Next.js UI |
| `infra/railway/env.example` | Reference variables for manual wiring |
| `.railway/README.md` | Choose Option A (IaC) vs Option B (JSON config) |

## Important: how Railway reads config

- **One config file = one service.** Attaching the repo once does not auto-create all services.
- **Config file path must be absolute** from repo root, e.g. `/backend-core/railway.json` — it does **not** follow Root Directory.
- **`.railway/railway.ts` is NOT a config-as-code path** — only for `railway config apply` CLI.

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

## Option B — Attach repo per service (railway.json)

For each service in Railway:

1. **Root Directory** → service folder (`engine-math`, `backend-core`, or `frontend-table`)
2. **Config-as-code file path** → absolute path (must start with `/`):

   | Service | Config file path |
   |---------|------------------|
   | engine-math | `/engine-math/railway.json` |
   | backend-core | `/backend-core/railway.json` |
   | frontend-table | `/frontend-table/railway.json` |

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
