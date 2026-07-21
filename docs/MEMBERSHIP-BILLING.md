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

## Tier enforcement (wired)

Gates read the caller's subscription tier and reject over-limit actions:

- `club_create` — club-create limit (owned-club count vs tier; 0 = cannot
  create, -1 = unlimited).
- `club_owner_add` — club member cap (using the club owner's tier).
- `table_create` — big blind capped to `EffectiveMaxBigBlindCents(tier)` (free
  plays the default $1/$2; platinum = unlimited).

Still cosmetic (follow-ups): multi-table limit, rakeback payout, daily bonus.

## KYC

- `poker_kyc` table + `store/kyc.go`. RPCs: `kyc_status`, `kyc_submit`
  (manual → `pending`), `kyc_verify_admin` (`ADMIN_USER_IDS`-gated verify/reject).
- **Gold/Platinum checkout requires `status = verified`** — `subscription_checkout`
  returns `{kyc_required:true}` otherwise. `/membership` shows the KYC banner + a
  "Verify identity" action.
- A live provider (Didit/Sumsub) can later call the same `SetStatus` path from its
  verified webhook.

## Crypto deposits (NOWPayments)

Fund the Nakama wallet with crypto — env-gated, dormant without keys.

- `wallet_deposit_crypto` (user) — records a **pending** `poker_deposit`, creates a
  hosted NOWPayments invoice, returns `invoice_url`. Requires a paid membership
  (free tier's daily deposit limit is $0) and caps the amount to the tier's daily
  limit.
- `nowpayments_webhook` (http_key) — verifies the `x-nowpayments-sig` HMAC-SHA512,
  then credits the wallet **exactly once** (idempotent `MarkCredited` transaction)
  on `finished`/`confirmed`. The wallet is never credited from the client.
- `/membership` has an "Add funds — crypto" panel.

### Env (crypto)

- `NOWPAYMENTS_API_KEY` — enables crypto deposits.
- `NOWPAYMENTS_IPN_SECRET` — required to accept IPN callbacks.
- `NOWPAYMENTS_IPN_CALLBACK_URL` — the webhook URL NOWPayments should call:
  `https://<backend-core-host>/v2/rpc/nowpayments_webhook?http_key=<NAKAMA_HTTP_KEY>&unwrap`

Deposit limits are enforced as a **rolling 24h sum** (`SumRecentCents`), not
per-transaction.

## Fiat (card) deposits

`wallet_deposit_fiat` (user) creates a one-time Stripe Checkout session
(`mode=payment`) tagged `metadata.kind=wallet_deposit`. The shared `stripe_webhook`
credits the wallet **once** via the deposit record on `checkout.session.completed`.
Same daily-limit gate as crypto. Dormant without `STRIPE_SECRET_KEY`.

## Withdrawals

- `wallet_withdraw` (user) — **holds** funds (debits the wallet in one
  transaction) and records a `pending` `poker_withdrawal`. Enforces the tier's
  **weekly** withdraw limit as a rolling 168h sum; requires a paid membership.
- `withdrawal_list` (user) — recent requests + status.
- `withdrawal_approve_admin` — marks `paid` (funds already held). Payout
  execution (sending crypto/fiat) is operator-driven / a future gateway-payout
  integration.
- `withdrawal_reject_admin` — **refunds** the held funds and marks `rejected`.

The wallet is the single authoritative ledger; every hold/refund writes to
`poker_wallet_ledger`.

## Daily bonus

`daily_bonus_status` / `daily_bonus_claim` — credits the tier's `DailyBonusChips`
once per ~24h (with a consecutive-day streak). One-transaction claim writes the
ledger.

## Railway env wiring

`APP_BASE_URL` and `NOWPAYMENTS_IPN_CALLBACK_URL` are wired in `.railway/railway.ts`
(derived from the service domains). The **secrets** — `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`,
`ADMIN_USER_IDS` — must be set in the Railway dashboard on `backend-core`.

Follow-ups: automated crypto/fiat payout execution on approve, multi-table limit,
rakeback (needs per-player rake accounting).
