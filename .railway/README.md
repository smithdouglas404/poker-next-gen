# Railway — synced from repo

This repo ships **two** Railway configuration styles. Pick **one** — Railway does not allow the same service to use both.

## Option A — Full project from repo (recommended)

Uses [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code): `.railway/railway.ts`

Creates Postgres + `engine-math` + `backend-core` + `frontend-table` with env vars wired.

```bash
npm i -g @railway/cli   # or brew install railway
railway login
railway link            # pick / create project
railway config plan     # preview
railway config apply    # create services + postgres
```

Then connect GitHub deploy on each service (IaC sets source to this repo).

**Do not** set per-service Config File paths in the dashboard when using IaC.

## Option B — Per-service `railway.toml` (attach repo manually)

Each deployable service has its own `railway.toml`. Railway reads it when you set **Config-as-code file path** to the **absolute repo path** (config does **not** follow Root Directory):

| Service | Root Directory | Config file path |
|---------|----------------|------------------|
| `engine-math` | `engine-math` | `/engine-math/railway.toml` |
| `backend-core` | `backend-core` | `/backend-core/railway.toml` |
| `frontend-table` | `frontend-table` | `/frontend-table/railway.toml` |

Steps:

1. Create Railway project
2. Add **PostgreSQL** plugin
3. Add **three empty services**, connect this GitHub repo
4. For each service: Settings → Root Directory + Config file path (table above)
5. Set variables from `infra/railway/env.example`
6. Deploy

**Do not** run `railway config apply` if using Option B (conflicts with TOML).

## What each TOML configures

| File | Builder | Healthcheck |
|------|---------|-------------|
| `engine-math/railway.toml` | Dockerfile | `/health` |
| `backend-core/railway.toml` | Dockerfile | `/healthcheck` |
| `frontend-table/railway.toml` | Railpack | `/` |

All include `watchPatterns` so changes in one service folder do not rebuild the others.

## More detail

See [docs/RAILWAY.md](../docs/RAILWAY.md).
