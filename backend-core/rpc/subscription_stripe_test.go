package rpc

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

// The Stripe webhook is the ONLY path that grants a paid membership tier. Its
// signature check is therefore the boundary between "a customer paid" and
// "anyone can mint a subscription", so the rules are pinned here.

const testSecret = "whsec_test_secret"

// signStripe builds a valid Stripe-Signature header for a payload at a time.
func signStripe(payload string, at time.Time, secret string) string {
	ts := fmt.Sprintf("%d", at.Unix())
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + payload))
	return fmt.Sprintf("t=%s,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

func TestVerifyStripeSignature_AcceptsAFreshValidSignature(t *testing.T) {
	body := `{"type":"invoice.paid"}`
	if !verifyStripeSignature(body, signStripe(body, time.Now(), testSecret), testSecret) {
		t.Fatal("a freshly signed payload was rejected — this breaks every real webhook")
	}
}

func TestVerifyStripeSignature_RejectsReplay(t *testing.T) {
	// THE REPLAY GUARD. Without a timestamp tolerance the signature covers the
	// timestamp but nothing checks it, so a captured webhook stays valid forever.
	// The replayable events are the ones that grant a tier and extend a
	// subscription — an attacker who ever observes one could re-grant at will.
	body := `{"type":"checkout.session.completed"}`
	old := time.Now().Add(-stripeSignatureTolerance - time.Minute)
	if verifyStripeSignature(body, signStripe(body, old, testSecret), testSecret) {
		t.Error("a correctly-signed but stale webhook was accepted — replay is possible")
	}
	// Just inside the window still works, so ordinary network delay is fine.
	recent := time.Now().Add(-stripeSignatureTolerance + 30*time.Second)
	if !verifyStripeSignature(body, signStripe(body, recent, testSecret), testSecret) {
		t.Error("a webhook inside the tolerance was rejected — normal delivery latency would fail")
	}
	// Far-future timestamps are refused too; otherwise a skewed clock mints a
	// signature that stays valid long after capture.
	future := time.Now().Add(stripeSignatureTolerance + time.Minute)
	if verifyStripeSignature(body, signStripe(body, future, testSecret), testSecret) {
		t.Error("a far-future timestamp was accepted")
	}
}

func TestVerifyStripeSignature_RejectsTampering(t *testing.T) {
	body := `{"type":"checkout.session.completed","data":{"object":{"metadata":{"tier":"bronze"}}}}`
	header := signStripe(body, time.Now(), testSecret)

	// Body swapped for a richer tier, signature kept.
	tampered := `{"type":"checkout.session.completed","data":{"object":{"metadata":{"tier":"platinum"}}}}`
	if verifyStripeSignature(tampered, header, testSecret) {
		t.Error("a modified body passed with the original signature")
	}
	// Wrong secret (e.g. the test-mode secret against live traffic).
	if verifyStripeSignature(body, header, "whsec_a_different_secret") {
		t.Error("a signature verified under the wrong secret")
	}
}

func TestVerifyStripeSignature_RejectsMalformedHeaders(t *testing.T) {
	body := `{}`
	for _, h := range []string{
		"",                                     // absent
		"t=,v1=",                               // empty parts
		"v1=deadbeef",                          // no timestamp
		fmt.Sprintf("t=%d", time.Now().Unix()), // no signature
		"t=not-a-number,v1=deadbeef",           // unparseable timestamp
		"garbage",
	} {
		if verifyStripeSignature(body, h, testSecret) {
			t.Errorf("malformed header %q was accepted", h)
		}
	}
}
