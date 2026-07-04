# Deploy on Railway (one config file)

Skip local Docker. The **entire stack** is defined in a single file:

```
.railway/railway.ts
```

That file creates Postgres plus `engine-math`, `backend-core`, and `frontend-table`, including build commands, healthchecks, and environment variables.

## Why not one `railway.json`?

Railway’s [Config as Code](https://docs.railway.com/config-as-code) (`railway.json`) applies to **one service at a time**. A multi-service monorepo needs [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) (`.railway/railway.ts`).

| Feature | Scope | File |
|---------|-------|------|
| Config as Code | One service | `*/railway.json` |
| **Infrastructure as Code** | **Whole project** | **`.railway/railway.ts`** |

> TypeScript is currently the only supported language for whole-project config.

## Setup (recommended)

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

After apply, Railway deploys from GitHub using each service’s `rootDirectory` (`engine-math`, `backend-core`, `frontend-table`).

**Do not** set “Config-as-code file path” on individual services in the dashboard. IaC owns those settings.

## Already have services on Railway?

If services were previously managed by per-service `railway.json` files:

1. Pull current state (optional): `railway config pull --force`
2. Ensure `.railway/railway.ts` matches what you want
3. Remove any `*/railway.json` from the repo (Railway blocks IaC while those exist)
4. Clear config-as-code paths in the dashboard for each service
5. Run `railway config plan` then `railway config apply`

## Verify

```bash
curl https://<engine-math-domain>/health
curl https://<backend-core-domain>/healthcheck
open https://<frontend-table-domain>/
```

Domains appear in the Railway dashboard after the first successful deploy.

## Environment variables

All cross-service wiring lives in `.railway/railway.ts`. For reference (or manual debugging), see `infra/railway/env.example`.

Key wiring:

- `backend-core` → Postgres via `DATABASE_ADDRESS`
- `backend-core` → `engine-math` at `http://engine-math.railway.internal:8080`
- `frontend-table` → Nakama privately at `http://backend-core.railway.internal:7350`
- Browser → public HTTPS domains for `NEXT_PUBLIC_*` vars

## Local Docker vs Railway

| | Docker Compose | Railway |
|---|----------------|---------|
| Use when | Full offline dev, optional OddSlingers | Cloud, no local containers |
| Config in repo | `docker-compose.yml` | `.railway/railway.ts` |
| Postgres | Container | Railway plugin |
