# Railway — synced from repo (JSON config-as-code)

## Config file path (per service)

In Railway → Service → Settings → **Config-as-code file path**, use **JSON only**:

| Service | Root Directory | Config-as-code file path |
|---------|----------------|--------------------------|
| engine-math | `engine-math` | `/engine-math/railway.json` |
| backend-core | `backend-core` | `/backend-core/railway.json` |
| frontend-table | `frontend-table` | `/frontend-table/railway.json` |

Path must start with `/` (absolute from repo root).

**Do not use:** `.railway/railway.ts` in this field — that is CLI IaC only.

## Option A — CLI (`railway config apply`)

```bash
npm i -g @railway/cli
railway login
railway link
railway config apply
```

Uses `.railway/railway.ts` — creates Postgres + all 3 services. No JSON path needed in dashboard.

## Option B — Dashboard (attach GitHub repo)

1. Create Railway project + **PostgreSQL** plugin
2. Add 3 services, connect this repo
3. Set Root Directory + config path (table above) for each
4. Variables from `infra/railway/env.example`
5. Deploy

## Files

| File | Purpose |
|------|---------|
| `engine-math/railway.json` | Rust rs_poker sidecar |
| `backend-core/railway.json` | Nakama plugin |
| `frontend-table/railway.json` | Next.js UI |
| `.railway/railway.ts` | Full project IaC (CLI only) |

See [docs/RAILWAY.md](../docs/RAILWAY.md).
