package rpc

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// stripeConfigured reports whether live billing is wired (a secret key is set).
// When false, checkout returns a friendly "not configured" response instead of
// erroring, mirroring HRC's dormant-gateway pattern.
func stripeConfigured() bool {
	return os.Getenv("STRIPE_SECRET_KEY") != ""
}

// SubscriptionCheckout creates a real recurring Stripe Checkout session
// (mode=subscription — NOT the one-time payment HRC used). The intended tier is
// carried in the session + subscription metadata so the webhook — and only the
// webhook — grants it after payment succeeds.
func SubscriptionCheckout(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	// Paying for services requires biometric-verified registration.
	if err := requireVerified(ctx, db, userID, "biometric", "purchasing a subscription"); err != nil {
		return "", err
	}
	var req struct {
		Tier     string `json:"tier"`
		Interval string `json:"interval"` // "month" | "year"
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if !billing.IsPaidTier(req.Tier) {
		return "", runtime.NewError("valid paid tier required", 3)
	}
	if req.Interval != "year" {
		req.Interval = "month"
	}

	// KYC gate: Gold/Platinum require a verified identity (matches the
	// subscription/KYC model). Bronze/Silver do not.
	if req.Tier == "gold" || req.Tier == "platinum" {
		if !store.NewKYCStore(db).IsVerified(ctx, userID) {
			out, _ := json.Marshal(map[string]interface{}{
				"configured":   stripeConfigured(),
				"kyc_required": true,
				"message":      "Identity verification is required for Gold and Platinum. Complete KYC first.",
			})
			return string(out), nil
		}
	}
	if !stripeConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Billing is not configured yet (set STRIPE_SECRET_KEY).",
		})
		return string(out), nil
	}

	tier := billing.GetTierDef(req.Tier)
	amount := tier.MonthlyPriceCents
	if req.Interval == "year" {
		amount = tier.AnnualPriceCents
	}

	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = "https://app.example.com"
	}

	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("client_reference_id", userID)
	form.Set("success_url", base+"/membership?status=success")
	form.Set("cancel_url", base+"/membership?status=cancel")
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", "usd")
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(amount, 10))
	form.Set("line_items[0][price_data][recurring][interval]", req.Interval)
	form.Set("line_items[0][price_data][product_data][name]", "High Rollers "+tier.Name+" Membership")
	form.Set("metadata[user_id]", userID)
	form.Set("metadata[tier]", req.Tier)
	form.Set("metadata[interval]", req.Interval)
	form.Set("subscription_data[metadata][user_id]", userID)
	form.Set("subscription_data[metadata][tier]", req.Tier)
	form.Set("subscription_data[metadata][interval]", req.Interval)

	body, status, err := stripePost(ctx, "https://api.stripe.com/v1/checkout/sessions", form)
	if err != nil {
		logger.Error("stripe checkout error: %v", err)
		return "", runtime.NewError("billing error", 13)
	}
	if status >= 300 {
		logger.Error("stripe checkout http %d: %s", status, string(body))
		return "", runtime.NewError("billing error", 13)
	}
	var session struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return "", runtime.NewError("billing error", 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured":  true,
		"checkout_url": session.URL,
		"session_id":  session.ID,
	})
	return string(out), nil
}

// createStripeDepositSession creates a one-time (mode=payment) Checkout session
// to top up the wallet. The wallet is credited by the webhook on completion.
func createStripeDepositSession(ctx context.Context, userID, depositID string, amountCents int64) (string, error) {
	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = "https://app.example.com"
	}
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("client_reference_id", userID)
	form.Set("success_url", base+"/membership?deposit=success")
	form.Set("cancel_url", base+"/membership?deposit=cancel")
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", "usd")
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(amountCents, 10))
	form.Set("line_items[0][price_data][product_data][name]", "High Rollers wallet deposit")
	form.Set("metadata[kind]", "wallet_deposit")
	form.Set("metadata[deposit_id]", depositID)
	form.Set("metadata[user_id]", userID)
	form.Set("payment_intent_data[metadata][kind]", "wallet_deposit")
	form.Set("payment_intent_data[metadata][deposit_id]", depositID)

	body, status, err := stripePost(ctx, "https://api.stripe.com/v1/checkout/sessions", form)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", fmt.Errorf("stripe http %d: %s", status, string(body))
	}
	var session struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return "", err
	}
	return session.URL, nil
}

func stripePost(ctx context.Context, endpoint string, form url.Values) ([]byte, int, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, 0, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+os.Getenv("STRIPE_SECRET_KEY"))
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

// StripeWebhook is the ONLY payment-driven path that grants a membership tier.
// It verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET, then
// activates/renews/cancels the tier. Call it (from Stripe) at:
//
//	POST /v2/rpc/stripe_webhook?http_key=<key>&unwrap
//
// `unwrap` makes Nakama pass the raw JSON body as the payload so the signature
// (computed over the raw body) verifies.
func StripeWebhook(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	secret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if secret == "" {
		return "", runtime.NewError("billing not configured", 13)
	}
	sig := headerValue(ctx, "stripe-signature")
	if !verifyStripeSignature(payload, sig, secret) {
		logger.Warn("stripe webhook signature mismatch")
		return "", runtime.NewError("invalid signature", 16)
	}

	var event struct {
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return "", runtime.NewError("invalid event", 3)
	}

	subs := store.NewSubscriptionStore(db)
	switch event.Type {
	case "checkout.session.completed":
		var obj struct {
			ClientReferenceID string            `json:"client_reference_id"`
			Customer          string            `json:"customer"`
			Subscription      string            `json:"subscription"`
			Metadata          map[string]string `json:"metadata"`
		}
		_ = json.Unmarshal(event.Data.Object, &obj)

		// A wallet top-up (mode=payment) rather than a subscription: credit the
		// wallet exactly once via the deposit record.
		if obj.Metadata["kind"] == "wallet_deposit" {
			depositID := obj.Metadata["deposit_id"]
			if depositID != "" {
				if _, err := store.NewDepositStore(db).MarkCredited(ctx, depositID); err != nil {
					logger.Error("stripe wallet deposit credit failed: %v", err)
					return "", runtime.NewError("credit failed", 13)
				}
			}
			return `{"received":true}`, nil
		}

		userID := obj.Metadata["user_id"]
		if userID == "" {
			userID = obj.ClientReferenceID
		}
		tier := obj.Metadata["tier"]
		months := 1
		if obj.Metadata["interval"] == "year" {
			months = 12
		}
		if userID != "" && billing.IsPaidTier(tier) {
			if _, err := subs.Grant(ctx, userID, tier, months, "stripe", obj.Subscription, obj.Customer, obj.Subscription); err != nil {
				logger.Error("stripe grant failed: %v", err)
				return "", runtime.NewError("grant failed", 13)
			}
			logger.Info("granted %s to user %s via stripe", tier, userID)
		}
	case "invoice.paid":
		// Renewal: extend the existing tier by one interval.
		var obj struct {
			Subscription string `json:"subscription"`
			Lines        struct {
				Data []struct {
					Period struct {
						End int64 `json:"end"`
					} `json:"period"`
				} `json:"data"`
			} `json:"lines"`
		}
		_ = json.Unmarshal(event.Data.Object, &obj)
		if obj.Subscription != "" {
			userID, _ := subs.FindByStripeSubscription(ctx, obj.Subscription)
			if userID != "" {
				cur, _ := subs.Get(ctx, userID)
				if billing.IsPaidTier(cur.Tier) {
					_, _ = subs.Grant(ctx, userID, cur.Tier, 1, "stripe_renewal", obj.Subscription, cur.StripeCustomerID, obj.Subscription)
				}
			}
		}
	case "customer.subscription.deleted":
		var obj struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(event.Data.Object, &obj)
		if obj.ID != "" {
			userID, _ := subs.FindByStripeSubscription(ctx, obj.ID)
			if userID != "" {
				_, _ = subs.Grant(ctx, userID, "free", 1, "stripe_cancel", obj.ID, "", "")
			}
		}
	}
	return `{"received":true}`, nil
}

// verifyStripeSignature checks the Stripe-Signature header (t=…,v1=…) with a
// constant-time HMAC-SHA256 comparison over "timestamp.payload".
func verifyStripeSignature(payload, header, secret string) bool {
	if header == "" {
		return false
	}
	var ts, v1 string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			ts = kv[1]
		case "v1":
			v1 = kv[1]
		}
	}
	if ts == "" || v1 == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%s.%s", ts, payload)))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}

// headerValue reads a request header (case-insensitive) from the Nakama RPC ctx.
func headerValue(ctx context.Context, name string) string {
	headers, ok := ctx.Value(runtime.RUNTIME_CTX_HEADERS).(map[string][]string)
	if !ok {
		return ""
	}
	name = strings.ToLower(name)
	for k, v := range headers {
		if strings.ToLower(k) == name && len(v) > 0 {
			return v[0]
		}
	}
	return ""
}
