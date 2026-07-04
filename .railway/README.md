# Railway — synced from repo

## ⚠️ Common error: wrong config file

Railway **Config-as-code file path** (in service Settings) accepts **only**:

- `/backend-core/railway.json` ✅
- `/backend-core/railway.toml` ✅

It does **NOT** accept:

- `.railway/railway.ts` ❌ (that file is for `railway config apply` CLI only)
- `backend-core/railway.json` ❌ (missing leading `/`)
- `/railway.toml` at repo root ❌ (does not exist — this is a monorepo)

## Option A — CLI project setup (`.railway/railway.ts`)

Creates Postgres + all 3 services. **Do not** set Config file path in dashboard.

```bash
npm i -g @railway/cli
railway login
railway link
railway config plan
railway config apply
```

## Option B — Attach GitHub repo per service (`railway.json`)

Create **3 separate services** + **PostgreSQL** in one Railway project.

For **each** service, in Settings set:

| Service | Root Directory | Config-as-code file path |
|---------|----------------|--------------------------|
| engine-math | `engine-math` | `/engine-math/railway.json` |
| backend-core | `backend-core` | `/backend-core/railway.json` |
| frontend-table | `frontend-table` | `/frontend-table/railway.json` |

Path must start with `/` and be from **repo root** (not relative to Root Directory).

Variables: copy from `infra/railway/env.example`.

Then click **Deploy**.

## Files in this repo

| File | Used by |
|------|---------|
| `engine-math/railway.json` | Option B — engine-math service |
| `backend-core/railway.json` | Option B — Nakama service |
| `frontend-table/railway.json` | Option B — Next.js UI |
| `*/railway.toml` | Same as `.json` (TOML format alternative) |
| `.railway/railway.ts` | Option A — `railway config apply` only |

Use **either** `.json` **or** `.toml` in the config path — not both for the same service.

## More detail

[docs/RAILWAY.md](../docs/RAILWAY.md)
