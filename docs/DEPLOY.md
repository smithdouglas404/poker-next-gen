# Deploy in 4 commands (copy-paste)

**Where:** your Mac terminal, in this repo folder.  
**What:** Railway cloud — no Docker on your machine.

## 1. One-time setup

```bash
cd poker-next-gen
npm install
npm run railway:login
```

A browser tab opens → log into [railway.app](https://railway.app) → click **Authorize**.

## 2. Link to a Railway project

```bash
npm run railway:link
```

Pick **Create new project** (or an existing one). Name it anything (e.g. `poker-next-gen`).

## 3. Preview (optional)

```bash
npm run deploy:plan
```

Shows what will be created: Postgres + 3 services.

## 4. Deploy everything

```bash
npm run deploy
```

Confirm when prompted. Railway creates:

- PostgreSQL
- engine-math
- backend-core (Nakama)
- frontend-table (Next.js UI)

## 5. Open your app

Railway dashboard → **frontend-table** service → **Settings** → **Networking** → copy the public URL.

Open that URL in your browser. Command Center is `/`, health check is `/stack`.

---

## Why an agent can't do this for you

`railway login` needs **your** browser and **your** Railway account. This repo has the config file (`.railway/railway.ts`) ready — only the login step must happen on your machine.

If you want CI/agents to deploy later, create a token at [railway.app/account/tokens](https://railway.app/account/tokens) and set `RAILWAY_API_TOKEN` — but for first setup, use `npm run railway:login` in your terminal.

---

## If something fails

```bash
npx railway logs --service backend-core
npx railway logs --service engine-math
npx railway logs --service frontend-table
```

Make sure GitHub repo `smithdouglas404/poker-next-gen` is connected in Railway (IaC wires this on apply).

More detail: [RAILWAY.md](./RAILWAY.md)
