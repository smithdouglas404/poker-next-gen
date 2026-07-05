# mcp-coach

The **agentic layer** for `poker-next-gen` (Phase 2 of
[`docs/CAPABILITY-WIRING.md`](../docs/CAPABILITY-WIRING.md)): a Claude-backed
MCP (Model Context Protocol) server providing a **live coach** and an
**anti-bot analyst**.

Both tools ground their answers in the **real** engine — `engine-math`
(rs_poker). The engine computes; Claude explains. Per Golden Rule #4, this
service never invents shuffle/hand-rank/equity math: if the engine-math sidecar
is unreachable, `analyze_spot` fails loudly instead of fabricating a number.

Built on the official Anthropic MCP SDK (`@modelcontextprotocol/sdk`) and the
Anthropic SDK (`@anthropic-ai/sdk`). Transport is stdio.

## Tools

### `analyze_spot`

Coach a specific Texas Hold'em decision. It calls engine-math first, then has
Claude explain the results:

| Engine call | Endpoint | Purpose |
|---|---|---|
| CFR solve | `POST {ENGINE_MATH_URL}/gto/solve` | Regret-minimized (PCFR+) action for the exact spot |
| Equity | `POST {ENGINE_MATH_URL}/equity` | Monte-Carlo equity for hero vs villain |
| Pot odds / EV | `POST {ENGINE_MATH_URL}/gto/advise` | Equity-heuristic pot-odds / EV-of-call |

Claude then returns a concise **Read / Recommendation / Mistake-alert** coaching
note, grounded strictly in those engine numbers. A non-converged CFR solve is
surfaced as low confidence.

Inputs: `hero_hole`, `villain_hole` (concrete two-card hands, rs_poker
notation e.g. `AsKh`), `board`, `pot`, `to_call`, `hero_stack`, `villain_stack`,
`deadline_ms`.

> Note: engine-math currently has no range endpoint (`/equity/range`) or
> `/outs` endpoint — those are Phase-1b follow-ups. `analyze_spot` therefore
> takes a concrete villain hand. Pass the most representative combo for a range
> read.

### `flag_bot`

Assess whether a player is likely a bot by reasoning over a sequence of their
actions (timing, sizing, frequency). Returns a structured JSON verdict
(`verdict`, `confidence`, `bot_likelihood`, weighted `signals`, `reasoning`,
`recommended_action`). Complements the statistical scorer in
`backend-core/antibot` — it captures qualitative patterns a fixed score misses.
No engine-math dependency.

Inputs: `player_id`, optional `hands_observed`, `actions[]` (each with
`street`, `action`, `sizing_bb`, `pot_fraction`, `decision_ms`), optional
`notes`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (at tool-call time) | — | Auth for the Anthropic API. Read from the environment at call time; **never hardcoded**. The server boots without it, but any tool call errors clearly until it is set. |
| `ENGINE_MATH_URL` | No | `http://localhost:8080` | Base URL of the rs_poker sidecar. In the Railway/Docker stack this is `http://engine-math.railway.internal:8080` (or the compose service host). |
| `COACH_MODEL` | No | `claude-opus-4-8` | Agent model. `claude-sonnet-5` is a lower-cost alternative; both use adaptive thinking. |

## Build & run

```bash
cd mcp-coach
npm install
npm run build          # tsc -> dist/
npm start              # node dist/index.js  (stdio MCP server)
```

The server speaks MCP over **stdio** — stdout is the transport, so all logs go
to stderr. Run it under an MCP client rather than interactively.

### Registering with an MCP client

Example client config entry:

```json
{
  "mcpServers": {
    "poker-coach": {
      "command": "node",
      "args": ["/absolute/path/to/poker-next-gen/mcp-coach/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "ENGINE_MATH_URL": "http://localhost:8080"
      }
    }
  }
}
```

## What needs a live environment to actually function

Compilation and server boot require neither a key nor a running engine. Actual
tool execution needs:

- **`analyze_spot`**: both a reachable **engine-math** sidecar (`ENGINE_MATH_URL`)
  **and** `ANTHROPIC_API_KEY`. If every engine call fails it returns an error
  instead of calling Claude (no fabricated math). If some engine calls succeed,
  Claude explains what is available and names any missing input.
- **`flag_bot`**: `ANTHROPIC_API_KEY` only.
