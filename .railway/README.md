# Railway — one config file for the whole stack

Railway has two config systems:

| System | Scope | File |
|--------|-------|------|
| Config as Code | **One service** | `service/railway.json` |
| **Infrastructure as Code** | **Entire project** | **`.railway/railway.ts`** |

This repo uses **one file for everything**: `.railway/railway.ts`.

It defines Postgres, all three services, build settings, healthchecks, and env wiring.

> Railway does **not** support a single root `railway.json` for multi-service projects. The whole-project format is TypeScript-only (for now). See [Railway IaC docs](https://docs.railway.com/infrastructure-as-code).

## Deploy

```bash
npm i -g @railway/cli   # CLI 5.2+ for IaC
railway login
railway link            # pick/create project + environment
railway config plan     # preview changes
railway config apply    # create/update Postgres + all services
```

Do **not** set per-service “Config-as-code file path” in the Railway dashboard when using IaC. That field is for single-service `railway.json` only.

## What gets created

| Resource | Build | Healthcheck |
|----------|-------|-------------|
| PostgreSQL | Railway plugin | — |
| `engine-math` | Dockerfile | `/health` |
| `backend-core` | Dockerfile | `/healthcheck` |
| `frontend-table` | Railpack (`npm ci && npm run build`) | `/` |

Private networking uses `*.railway.internal`. Browser-facing URLs use each service’s public Railway domain.

## Reference env vars

See `infra/railway/env.example` for the same variables in dashboard reference syntax (useful when reading logs or debugging).

Full walkthrough: [docs/RAILWAY.md](../docs/RAILWAY.md).
