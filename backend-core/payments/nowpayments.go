// Package payments wraps external payment gateways used to fund the wallet.
//
// NOWPayments (crypto) is the first gateway, ported from HighRollersClub. It is
// env-gated: without NOWPAYMENTS_API_KEY the whole flow reports "not configured"
// instead of erroring, so the app runs fine before billing is turned on.
package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

const nowPaymentsAPI = "https://api.nowpayments.io/v1"

// NowPaymentsConfigured reports whether the crypto gateway is enabled.
func NowPaymentsConfigured() bool {
	return os.Getenv("NOWPAYMENTS_API_KEY") != ""
}

// CreateNowPaymentsInvoice creates a hosted crypto checkout invoice for the
// given amount (in cents) and returns its public URL + invoice id.
func CreateNowPaymentsInvoice(ctx context.Context, amountCents int64, orderID, description, callbackURL string) (invoiceURL, invoiceID string, err error) {
	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = "https://app.example.com"
	}
	body := map[string]interface{}{
		"price_amount":      float64(amountCents) / 100.0,
		"price_currency":    "usd",
		"order_id":          orderID,
		"order_description": description,
		"ipn_callback_url":  callbackURL,
		"success_url":       base + "/membership?deposit=success",
		"cancel_url":        base + "/membership?deposit=cancel",
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, nowPaymentsAPI+"/invoice", bytes.NewReader(raw))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("x-api-key", os.Getenv("NOWPAYMENTS_API_KEY"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("nowpayments http %d: %s", resp.StatusCode, string(respBody))
	}
	var out struct {
		ID         json.Number `json:"id"`
		InvoiceURL string      `json:"invoice_url"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return "", "", err
	}
	return out.InvoiceURL, out.ID.String(), nil
}

// VerifyNowPaymentsIPN checks the x-nowpayments-sig header: HMAC-SHA512 over the
// request body with keys sorted alphabetically, using the IPN secret. We decode
// with json.Number so number formatting is preserved through the re-marshal
// (Go sorts map keys on Marshal), keeping the HMAC stable.
func VerifyNowPaymentsIPN(rawBody, signature string) bool {
	secret := os.Getenv("NOWPAYMENTS_IPN_SECRET")
	if secret == "" || signature == "" {
		return false
	}
	dec := json.NewDecoder(bytes.NewReader([]byte(rawBody)))
	dec.UseNumber()
	var parsed interface{}
	if err := dec.Decode(&parsed); err != nil {
		return false
	}
	sorted, err := json.Marshal(parsed)
	if err != nil {
		return false
	}
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(sorted)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// NowPaymentsEvent is the subset of the IPN payload we act on.
type NowPaymentsEvent struct {
	OrderID       string `json:"order_id"`
	PaymentID     string `json:"payment_id"`
	PaymentStatus string `json:"payment_status"`
}

// ParseNowPaymentsEvent extracts the fields we need (payment_id may be numeric).
func ParseNowPaymentsEvent(rawBody string) (NowPaymentsEvent, error) {
	var raw struct {
		OrderID       string      `json:"order_id"`
		PaymentID     json.Number `json:"payment_id"`
		PaymentStatus string      `json:"payment_status"`
	}
	if err := json.Unmarshal([]byte(rawBody), &raw); err != nil {
		return NowPaymentsEvent{}, err
	}
	return NowPaymentsEvent{
		OrderID:       raw.OrderID,
		PaymentID:     raw.PaymentID.String(),
		PaymentStatus: raw.PaymentStatus,
	}, nil
}

// FormatCentsUSD is a tiny helper for logs/descriptions.
func FormatCentsUSD(cents int64) string {
	return "$" + strconv.FormatFloat(float64(cents)/100.0, 'f', 2, 64)
}

// ── Payouts (withdrawal execution) ─────────────────────────────────────────
//
// NOWPayments mass-payout needs a JWT (email/password) in addition to the API
// key, and — depending on the account — a whitelisted IP and per-payout 2FA. We
// implement auth → estimate (USD→coin) → create payout. If the account requires
// 2FA verification, the batch is created but stays pending on NOWPayments until
// an operator verifies it; the approve flow still records our side as paid with
// the batch id. Fully hands-off payout requires the account be configured for
// it. Gated on NOWPAYMENTS_EMAIL + NOWPAYMENTS_PASSWORD.

// NowPaymentsPayoutConfigured reports whether automated crypto payouts are set up.
func NowPaymentsPayoutConfigured() bool {
	return NowPaymentsConfigured() &&
		os.Getenv("NOWPAYMENTS_EMAIL") != "" &&
		os.Getenv("NOWPAYMENTS_PASSWORD") != ""
}

func nowPaymentsAuth(ctx context.Context) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"email":    os.Getenv("NOWPAYMENTS_EMAIL"),
		"password": os.Getenv("NOWPAYMENTS_PASSWORD"),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, nowPaymentsAPI+"/auth", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("nowpayments auth http %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Token == "" {
		return "", fmt.Errorf("nowpayments auth: empty token")
	}
	return out.Token, nil
}

// estimateCoinAmount converts USD cents to the payout coin's amount string.
func estimateCoinAmount(ctx context.Context, amountCents int64, currency string) (string, error) {
	url := fmt.Sprintf("%s/estimate?amount=%s&currency_from=usd&currency_to=%s",
		nowPaymentsAPI, strconv.FormatFloat(float64(amountCents)/100.0, 'f', 2, 64), currency)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", os.Getenv("NOWPAYMENTS_API_KEY"))
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("nowpayments estimate http %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		EstimatedAmount json.Number `json:"estimated_amount"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.EstimatedAmount.String() == "" {
		return "", fmt.Errorf("nowpayments estimate: empty amount")
	}
	return out.EstimatedAmount.String(), nil
}

// CreateNowPaymentsPayout sends `amountCents` (USD) worth of `currency` to
// `address`, returning the payout batch id. `currency` is the coin ticker
// (e.g. "btc", "usdttrc20").
func CreateNowPaymentsPayout(ctx context.Context, address, currency string, amountCents int64) (string, error) {
	token, err := nowPaymentsAuth(ctx)
	if err != nil {
		return "", err
	}
	coinAmount, err := estimateCoinAmount(ctx, amountCents, currency)
	if err != nil {
		return "", err
	}
	body, _ := json.Marshal(map[string]interface{}{
		"ipn_callback_url": os.Getenv("NOWPAYMENTS_IPN_CALLBACK_URL"),
		"withdrawals": []map[string]interface{}{
			{"address": address, "currency": currency, "amount": coinAmount},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, nowPaymentsAPI+"/payout", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", os.Getenv("NOWPAYMENTS_API_KEY"))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("nowpayments payout http %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		ID json.Number `json:"id"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.ID.String(), nil
}
