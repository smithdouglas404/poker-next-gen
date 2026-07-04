# Deploy on Railway

The **entire stack** runs on Railway — no local Docker required.

One config file defines Postgres, all services, build settings, healthchecks, and
environment variables:

```
.railway/railway.ts
```

## Setup

```bash
npm i -g @railway/cli
railway login
railway link
railway config plan
railway config apply
```

1. `railway link` — connect this repo directory to a Railway project and environment.
2. `railway config plan` — preview what will be created or changed.
3. `railway config apply` — apply after confirming the plan.

After apply, Railway deploys from GitHub using each service’s `rootDirectory`
(`engine-math`, `backend-core`, `frontend-table`).

**Do not** set “Config-as-code file path” on individual services in the dashboard.
IaC owns those settings.

## What gets created

| Resource | Build | Healthcheck |
|----------|-------|-------------|
| PostgreSQL | Railway plugin | — |
| `engine-math` | Dockerfile | `/health` |
| `backend-core` | Dockerfile | `/healthcheck` |
| `frontend-table` | Railpack | `/` |

Private networking uses `*.railway.internal`. Browser-facing URLs use each
service’s public Railway domain (`NEXT_PUBLIC_*` env vars in IaC).

## Verify

After the first deploy, open the `frontend-table` public URL:

- Command Center: `/`
- Live stack dashboard: `/stack`

Or curl directly:

```bash
curl https://<engine-math-domain>/health
curl https://<backend-core-domain>/healthcheck
```

Domains appear in the Railway dashboard after deploy.

## Environment variables

All cross-service wiring lives in `.railway/railway.ts`. Reference copy:
`infra/railway/env.example`.

| Consumer | Variable | Points to |
|----------|----------|-----------|
| backend-core | `DATABASE_ADDRESS` | Postgres plugin |
| backend-core | `ENGINE_MATH_URL` | `http://engine-math.railway.internal:8080` |
| frontend-table | `NAKAMA_HOST` | `http://backend-core.railway.internal:7350` |
| frontend-table | `NEXT_PUBLIC_NAKAMA_HOST` | `https://<backend-core public domain>` |
| frontend-table | `NEXT_PUBLIC_ENGINE_MATH_URL` | `https://<engine-math public domain>` |

## Troubleshooting

```bash
railway logs --service backend-core
railway logs --service engine-math
railway logs --service frontend-table
railway config plan    # check for config drift
```

If services were previously managed by per-service `railway.json` files, remove
those from the repo and clear dashboard config-as-code paths before running
`railway config apply`.

## Why `.railway/railway.ts` and not one `railway.json`?

Railway [Config as Code](https://docs.railway.com/config-as-code) (`railway.json`)
applies to **one service**. Multi-service monorepos use
[Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
(`.railway/railway.ts`). TypeScript is currently the only whole-project format.

## Local Docker (optional)

Docker Compose remains in the repo for offline dev only. See
**[docs/DOCKER.md](./DOCKER.md)** — not required for Railway deployment.
