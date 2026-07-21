# Membership billing

Server-authoritative membership tiers on Nakama (Stage 2 of the HighRollersClub
integration). Ported HRC's 5-tier model but **fixed the two bugs that made HRC's
billing non-functional**:

1. HRC granted the tier from a route the user could call directly with no payment
   (`/api/tiers/activate`). Here, a paid tier is assigned **only** by the verified
   Stripe webhook or an admin RPC — never by the client.
2. HRC used one-time Stripe Checkout (`mode: "payment"`) and a manual expiry date.
   Here, checkout uses `mode: "subscription"` (real recurring billing), and the
   webhook renews/cancels the tier.

## Data model

- `poker_subscription` — one row per user: `tier`, `status`, `expires_at`, Stripe
  customer/subscription ids. Reads apply **lazy expiry** (a lapsed paid tier
  reverts to free).
- `poker_subscription_ledger` — append-only audit of every tier change
  (from → to, source, reference).

Tier catalog: `backend-core/billing/tiers.go` (single source of truth — prices,
limits, benefits).

## RPCs

| RPC | Auth | Purpose |
|-----|------|---------|
| `subscription_tiers` | public | Tier catalog for the pricing UI |
| `subscription_status` | user | Caller's current tier + limits + `billing_configured` |
| `subscription_checkout` | user | Create a recurring Stripe Checkout session (dormant without keys) |
| `stripe_webhook` | http_key | The only payment-driven grant path (signature-verified) |
| `subscription_grant_admin` | admin | Back-office comp/support grant |

## Enabling live billing

Set on the `backend-core` service:

- `STRIPE_SECRET_KEY` — enables checkout (until set, checkout returns
  `{configured:false}` and the UI shows "billing not configured").
- `STRIPE_WEBHOOK_SECRET` — required to accept webhooks.
- `APP_BASE_URL` — used for Checkout success/cancel URLs.
- `ADMIN_USER_IDS` — comma-separated Nakama user ids allowed to call
  `subscription_grant_admin` (empty = admin grant disabled).

### Stripe webhook endpoint

Point the Stripe webhook at the Nakama RPC, appending `&unwrap` so Nakama passes
the raw body (needed for signature verification):

```
https://<backend-core-host>/v2/rpc/stripe_webhook?http_key=<NAKAMA_HTTP_KEY>&unwrap
```

Subscribe to: `checkout.session.completed`, `invoice.paid`,
`customer.subscription.deleted`.

## Frontend

`/membership` — pricing grid (monthly/annual), current plan, Upgrade → Stripe
Checkout. Linked from the Command Center.

## Not yet wired (follow-ups)

- Enforce tier limits at the gates (club create/member caps, table stakes vs
  `max_big_blind_cents`, multi-table). The catalog values are in place; the
  enforcement calls are the next step.
- KYC gating for Gold/Platinum, rakeback payout, daily bonus.
