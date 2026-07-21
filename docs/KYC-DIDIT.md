# KYC — Didit identity verification

Progressive, risk-based KYC using [Didit](https://didit.me). Verification follows
the money, not the game: chip play is always free; players verify only to unlock
real-money deposits and higher limits. Each tier maps to a Didit **workflow** with
escalating checks.

## Level → tier → checks → limits

| KYC level | Tier | Didit checks (workflow) | Deposit / withdraw |
|-----------|------|-------------------------|--------------------|
| `email` | Free | Email + IP (no Didit workflow needed) | play chips only |
| `basic` | Bronze | Passive liveness + face match | $200/day · $500/wk |
| `standard` | Silver | + phone verification + age estimation | $1,000/day · $2,500/wk |
| `full` | Gold | + ID verification + proof of address + AML | $5,000/day · $10,000/wk |
| `enhanced` | Platinum | + NFC passport + active liveness + biometric | $25,000/day · $50,000/wk |

Limits are the `DepositLimitDailyCents` / `WithdrawLimitWeeklyCents` already
defined per tier in `backend-core/billing/tiers.go`.

## Configuration (all via env — never commit secrets)

Set on **backend-core** (creates sessions) and **frontend-table** (webhook receiver):

| Env var | Purpose |
|---------|---------|
| `DIDIT_API_KEY` | Didit secret API key (`x-api-key`). Presence enables KYC. |
| `DIDIT_WEBHOOK_SECRET` | HMAC secret to verify inbound webhooks. |
| `KYC_APPLY_SECRET` | Shared secret between the webhook route and `kyc_apply` (defaults to `DIDIT_WEBHOOK_SECRET`). |
| `DIDIT_WORKFLOW_BASIC` / `_STANDARD` / `_FULL` / `_ENHANCED` | Workflow id per level (from the Didit dashboard). |
| `DIDIT_BASE_URL` (optional) | Defaults to `https://verification.didit.me`. |
| `DIDIT_SESSION_PATH` (optional) | Defaults to `/v2/session/` (set `/v3/session/` if your account uses v3). |

In the Didit dashboard, point the webhook at:

```
https://<frontend-table domain>/api/kyc/webhook
```

## Flow

1. Player opens `/kyc` and clicks **Verify** for a level.
2. `kyc_start` (backend) creates a Didit session (`POST /v2/session/` with
   `workflow_id` + `vendor_data = <user id>`), records the target level as
   `pending`, and returns the hosted verification URL; the client redirects there.
3. Player completes Didit's flow. Didit POSTs a signed `status.updated` webhook to
   `/api/kyc/webhook`.
4. The route verifies the `X-Signature-Simple` HMAC-SHA256 over
   `session_id|status|created_at`, then calls the secret-protected `kyc_apply` RPC.
5. `kyc_apply` maps the status (`Approved → verified`, `Declined/expired → rejected`)
   and updates `poker_kyc`, preserving the level chosen at start.

Until `DIDIT_API_KEY` is set, `kyc_start` returns "identity verification is not
enabled yet" and the rest of the app is unaffected.
