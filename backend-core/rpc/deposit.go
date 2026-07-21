package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/payments"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// WalletDepositCrypto starts a crypto deposit: it records a pending deposit and
// creates a hosted NOWPayments invoice. The wallet is credited later, only when
// the verified IPN webhook confirms payment — never here.
func WalletDepositCrypto(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
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
	tier := store.SubscriptionTier(ctx, db, userID)
	def := billing.GetTierDef(tier)
	if def.DepositLimitDailyCents <= 0 {
		return "", runtime.NewError("deposits require a paid membership — upgrade to add real funds", 7)
	}
	if req.AmountCents > def.DepositLimitDailyCents {
		return "", runtime.NewError("amount exceeds your plan's daily deposit limit", 7)
	}

	if !payments.NowPaymentsConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Crypto deposits are not configured yet (set NOWPAYMENTS_API_KEY).",
		})
		return string(out), nil
	}

	deposits := store.NewDepositStore(db)
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
