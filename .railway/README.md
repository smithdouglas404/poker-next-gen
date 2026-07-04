# Railway — one config file for the whole stack

**Primary deployment path.** No local Docker required.

| Path | Purpose |
|------|---------|
| `.railway/railway.ts` | Postgres + all services + env wiring |
| `docs/RAILWAY.md` | Full deploy guide |
| `infra/railway/env.example` | Reference variables |

## Deploy

```bash
npm i -g @railway/cli
railway login
railway link
railway config plan
railway config apply
```

Do **not** set per-service “Config-as-code file path” in the dashboard.

## What gets created

| Resource | Build | Healthcheck |
|----------|-------|-------------|
| PostgreSQL | Railway plugin | — |
| `engine-math` | Dockerfile | `/health` |
| `backend-core` | Dockerfile | `/healthcheck` |
| `frontend-table` | Railpack | `/` |

## Local Docker (optional)

See [docs/DOCKER.md](../docs/DOCKER.md) — legacy offline dev only.
