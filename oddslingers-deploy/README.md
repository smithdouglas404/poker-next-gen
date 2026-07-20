# OddSlingers on Railway (Phase 6)

Deploys the OddSlingers reference platform as an **optional companion** service on
Railway. It is **not** the gameplay backend — Nakama + rs_poker remain the
authoritative engine (Golden Rule #4). OddSlingers runs standalone with its own
Postgres + Redis and gets its own public URL; the frontend `/stack` page and
Command Center can point at it.

## Source strategy (chosen)

**A self-contained production Dockerfile that git-clones the pinned upstream
commit at build time** (`oddslingers-deploy/Dockerfile`), rather than:
- *pointing Railway at the upstream repo* — cleanest, but we cannot add the
  required production Dockerfile to a third-party repo (no fork; GitHub access is
  scoped to this repo), and OddSlingers' own Dockerfile is dev-only;
- *vendoring* ~100k lines of LGPL source into this monorepo — bloat + licensing;
- *relying on the git submodule* being checked out during Railway's build —
  unreliable.

The build-time clone (pinned SHA `a3dcf1e…`) needs no submodule and no vendoring,
and we fully control the prod build steps.

## What's defined

- `.railway/railway.ts` → `group("OddSlingers (optional)")`: `oddslingers-postgres`
  (plugin), `oddslingers-redis` (image), `oddslingers-web` (this Dockerfile).
- Env wiring: Postgres creds from the plugin, Redis over `*.railway.internal`,
  `ALLOWED_HOSTS`/`DEFAULT_HOST` from the public domain.

## Before it will run — required secrets

Set these as Railway variables on `oddslingers-web` (never commit them):
- `SECRET_KEY` — Django secret.
- Optional: `MAILGUN_API_KEY`, `SENTRY_DSN_*`, etc. (features degrade without them).

## ⚠️ Not yet validated

This has **not** been built or deployed from CI. OddSlingers is a **Python 3.7
(EOL)** Django-Channels app; the Dockerfile mirrors its upstream build for a
production `daphne` ASGI process, but the following will likely need one or two
real Railway build iterations to nail down:
- `Pipfile.lock` dependency resolution on Python 3.7.
- The frontend build target (`yarn build` vs. a raw `webpack` invocation).
- `collectstatic` env requirements and static serving (whitenoise vs. a separate
  nginx service).
- Worker processes (`dramatiq`, `tablebeat`) are **not** deployed here — this is
  the web process only. Add them as further Railway services if needed.

Deploy with the rest of the stack via `railway config apply`.
