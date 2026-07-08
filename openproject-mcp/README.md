# openproject-mcp

AI review agent for OpenProject work packages, grounded on a knowledge graph.

## What it does

1. **Read** — connects to the **OpenProject MCP server** (official, read-only,
   `/mcp` endpoint) as a deterministic MCP client and lists work packages.
2. **Detect changes** — compares each work package's `lockVersion` (falling back
   to `updatedAt`) against what was last reviewed. Unchanged packages are skipped.
3. **Ground** — for each changed package, queries the **FalkorDB** knowledge
   graph (`faldrdb`) for the relevant subgraph.
4. **Review** — asks **Claude (`claude-opus-4-8`)** to produce an
   *insight*, *recommendation*, and *methodology recommendation*, grounded in the
   graph facts and the work-package fields (structured output).
5. **Write back** — posts the review as an activity comment on the work package
   via the **OpenProject REST API v3** (the MCP server is read-only, so writes go
   through REST).
6. **Ingest** — writes the review back into FalkorDB as new nodes/edges so future
   reviews build on past ones.

Runs on a schedule (**hourly by default; interval editable at runtime**) and
on demand via **Review now**. There is **no mock or fallback data** — if a
dependency is unconfigured or unreachable, the run reports the error.

## Configuration

Non-secret settings (URLs, interval, graph name, enabled) are edited from the
frontend **Admin → OpenProject MCP** page and persisted to
`OPENPROJECT_MCP_STATE_PATH`. Secrets are environment variables only:

| Env var | Purpose |
|---|---|
| `PORT` | Management API + health port (default 8090) |
| `OPENPROJECT_MCP_ADMIN_TOKEN` | Bearer token the frontend proxy uses. **Required.** |
| `OPENPROJECT_MCP_STATE_PATH` | Where config/cursor/reviews persist (use a volume) |
| `OPENPROJECT_MCP_URL` | OpenProject MCP endpoint, e.g. `https://op.example.com/mcp` |
| `OPENPROJECT_MCP_TOKEN` | Auth token for the MCP server |
| `OPENPROJECT_API_BASE_URL` | OpenProject base URL for REST write-back |
| `OPENPROJECT_API_TOKEN` | OpenProject API key for posting comments |
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENPROJECT_MCP_MODEL` | Review model (default `claude-opus-4-8`) |
| `FALKORDB_URL` | `redis://host:port` (or `FALKORDB_HOST`/`FALKORDB_PORT`/`FALKORDB_USERNAME`/`FALKORDB_PASSWORD`) |
| `FALKORDB_GRAPH` | Graph name (default `openproject`) |

See `.env.example`.

## Management API

All under `/api`, bearer-authenticated with `OPENPROJECT_MCP_ADMIN_TOKEN`
(the frontend calls these through a server-side proxy):

- `GET /health` — liveness (no auth)
- `GET /api/config` · `PUT /api/config` — read/update sync config
- `GET /api/status` — config, cursor, last run, readiness
- `GET /api/reviews` — recent reviews
- `POST /api/review-now` — run a sync immediately

## Develop

```bash
cd openproject-mcp
npm install
npm run typecheck
npm run build
npm start           # needs the env vars above
```

## Deploy (Railway)

Defined in `.railway/railway.ts` as the `openproject-mcp` service (Dockerfile
build, `/health` check). Set the secret env vars in the Railway dashboard;
`frontend-table` reaches it over `openproject-mcp.railway.internal:8090` and
shares `OPENPROJECT_MCP_ADMIN_TOKEN`.

## Notes

- The OpenProject MCP server does not publish stable verbatim tool names; the
  **list tool name** is configurable on the Admin page (default
  `list_work_packages`). Check the service logs for the tools it discovers.
- The FalkorDB retrieval/ingest Cypher assumes a simple schema (`WorkPackage`
  nodes keyed by `id`, `HAS_REVIEW` edges to `Review` nodes). Adjust
  `RETRIEVE_CYPHER` / `INGEST_CYPHER` in `src/kg.ts` to match your graph.
