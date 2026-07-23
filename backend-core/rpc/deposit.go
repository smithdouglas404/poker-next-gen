package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/payments"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// blockedByRG rejects a money action when the caller is in an active
// self-exclusion or cool-off window (responsible-gambling controls). These
// windows were settable but never enforced; this is the enforcement side.
func blockedByRG(ctx context.Context, db *sql.DB, userID string) error {
	if blocked, kind, until, _ := store.NewResponsibleStore(db).IsRestricted(ctx, userID); blocked {
		return runtime.NewError(
			fmt.Sprintf("you are in a %s period until %s", strings.ReplaceAll(kind, "_", "-"), until.Format("Jan 2, 2006")),
			7)
	}
	return nil
}

// WalletDepositCrypto starts a crypto deposit: it records a pending deposit and
// creates a hosted NOWPayments invoice. The wallet is credited later, only when
// the verified IPN webhook confirms payment — never here.
func WalletDepositCrypto(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requireRealMoney(); err != nil { // SEC-2: fail-closed real-money switch
		return "", err
	}
	if err := blockedByRG(ctx, db, userID); err != nil { // responsible-gambling gate
		return "", err
	}
	if err := guardJurisdiction(ctx, db); err != nil { // geo/IP jurisdiction gate
		return "", err
	}
	// Crypto deposits get the same KYC/AML floor as fiat — no crypto exemption.
	if err := requireVerified(ctx, db, userID, "kyc_aml", "depositing funds"); err != nil {
		return "", err
	}
	var req struct {
		AmountCents int64 `json:"amount_cents"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.AmountCents < 500 {
		return "", runtime.NewError("minimum deposit is $5.00", 3)
	}

	// Real-money deposits require a plan that permits them (free = play chips
	// only), and are capped at the tier's daily limit.
	deposits := store.NewDepositStore(db)
	if err := checkDepositLimit(ctx, db, deposits, userID, req.AmountCents); err != nil {
		return "", err
	}

	if !payments.NowPaymentsConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Crypto deposits are not configured yet (set NOWPAYMENTS_API_KEY).",
		})
		return string(out), nil
	}

	orderID, err := deposits.CreatePending(ctx, userID, req.AmountCents, "usd", "nowpayments")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	callback := os.Getenv("NOWPAYMENTS_IPN_CALLBACK_URL")
	invoiceURL, invoiceID, err := payments.CreateNowPaymentsInvoice(
		ctx, req.AmountCents, orderID, "High Rollers wallet deposit", callback)
	if err != nil {
		logger.Error("nowpayments invoice error: %v", err)
		_ = deposits.MarkFailed(ctx, orderID)
		return "", runtime.NewError("deposit gateway error", 13)
	}
	_ = deposits.AttachGatewayID(ctx, orderID, invoiceID)

	out, _ := json.Marshal(map[string]interface{}{
		"configured":  true,
		"invoice_url": invoiceURL,
		"deposit_id":  orderID,
	})
	return string(out), nil
}

// NowPaymentsBalance returns the platform's crypto custody balance held at
// NOWPayments (the house treasury). Admin-gated — this is operator finance data,
// never surfaced to players.
func NowPaymentsBalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	if !payments.NowPaymentsConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Crypto gateway not configured (set NOWPAYMENTS_API_KEY).",
			"balances":   []interface{}{},
		})
		return string(out), nil
	}
	balances, err := payments.GetNowPaymentsBalance(ctx)
	if err != nil {
		logger.Warn("nowpayments balance error: %v", err)
		return "", runtime.NewError("could not fetch NOWPayments balance", 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured": true,
		"balances":   balances,
	})
	return string(out), nil
}

// checkDepositLimit enforces that deposits require a paid plan and that this
// deposit plus the trailing-24h total stays within the tier's daily limit.
func checkDepositLimit(ctx context.Context, db *sql.DB, deposits *store.DepositStore, userID string, amountCents int64) error {
	tier := store.SubscriptionTier(ctx, db, userID)
	def := billing.GetTierDef(tier)
	if def.DepositLimitDailyCents <= 0 {
		return runtime.NewError("deposits require a paid membership — upgrade to add real funds", 7)
	}
	priorToday, err := deposits.SumRecentCents(ctx, userID, 24)
	if err != nil {
		return runtime.NewError(err.Error(), 13)
	}
	if priorToday+amountCents > def.DepositLimitDailyCents {
		return runtime.NewError("amount exceeds your plan's daily deposit limit", 7)
	}
	return nil
}

// WalletDepositFiat starts a card (fiat) deposit via a one-time Stripe Checkout
// session. The wallet is credited by the Stripe webhook (kind=wallet_deposit),
// never here. Same daily-limit gate as crypto.
func WalletDepositFiat(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requireRealMoney(); err != nil { // SEC-2: fail-closed real-money switch
		return "", err
	}
	if err := blockedByRG(ctx, db, userID); err != nil { // responsible-gambling gate
		return "", err
	}
	if err := guardJurisdiction(ctx, db); err != nil { // geo/IP jurisdiction gate
		return "", err
	}
	// Fiat deposits require KYC/AML (tier 3) — verification follows the money.
	if err := requireVerified(ctx, db, userID, "kyc_aml", "depositing funds"); err != nil {
		return "", err
	}
	var req struct {
		AmountCents int64 `json:"amount_cents"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.AmountCents < 500 {
		return "", runtime.NewError("minimum deposit is $5.00", 3)
	}
	deposits := store.NewDepositStore(db)
	if err := checkDepositLimit(ctx, db, deposits, userID, req.AmountCents); err != nil {
		return "", err
	}
	if !stripeConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Card deposits are not configured yet (set STRIPE_SECRET_KEY).",
		})
		return string(out), nil
	}
	orderID, err := deposits.CreatePending(ctx, userID, req.AmountCents, "usd", "stripe")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	url, err := createStripeDepositSession(ctx, userID, orderID, req.AmountCents)
	if err != nil {
		logger.Error("stripe deposit session error: %v", err)
		_ = deposits.MarkFailed(ctx, orderID)
		return "", runtime.NewError("deposit gateway error", 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured":  true,
		"checkout_url": url,
		"deposit_id":  orderID,
	})
	return string(out), nil
}

// NowPaymentsWebhook is the crypto IPN handler. It verifies the signature, then
// credits the wallet exactly once on a finished/confirmed payment. Call it at:
//
//	POST /v2/rpc/nowpayments_webhook?http_key=<key>&unwrap
//
// with the x-nowpayments-sig header (NOWPayments sends it).
func NowPaymentsWebhook(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if os.Getenv("NOWPAYMENTS_IPN_SECRET") == "" {
		return "", runtime.NewError("gateway not configured", 13)
	}
	sig := headerValue(ctx, "x-nowpayments-sig")
	if !payments.VerifyNowPaymentsIPN(payload, sig) {
		logger.Warn("nowpayments IPN signature mismatch")
		return "", runtime.NewError("invalid signature", 16)
	}
	evt, err := payments.ParseNowPaymentsEvent(payload)
	if err != nil || evt.OrderID == "" {
		return "", runtime.NewError("invalid event", 3)
	}

	deposits := store.NewDepositStore(db)
	switch evt.PaymentStatus {
	case "finished", "confirmed":
		credited, err := deposits.MarkCredited(ctx, evt.OrderID)
		if err != nil {
			logger.Error("deposit credit failed: %v", err)
			return "", runtime.NewError("credit failed", 13)
		}
		if credited {
			logger.Info("credited wallet for deposit %s", evt.OrderID)
		}
	case "failed", "expired", "refunded":
		_ = deposits.MarkFailed(ctx, evt.OrderID)
	}
	return `{"received":true}`, nil
}
