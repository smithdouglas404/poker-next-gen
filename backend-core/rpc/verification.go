package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// requireVerified enforces that the caller holds a verified status for a kind.
// Guests/unverified callers get a clear, typed error (9 = failed precondition).
// If Didit is not configured at all, verification is treated as unavailable and
// gates are NOT enforced (dev/dormant mode) so the app still works pre-launch.
func requireVerified(ctx context.Context, db *sql.DB, userID, kind, action string) error {
	// Dormant mode: without a provider configured, don't lock users out.
	if !integrations.DiditConfigured() {
		return nil
	}
	ok, err := store.NewVerificationStore(db).Verified(ctx, userID, kind)
	if err != nil {
		return runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return runtime.NewError(action+" requires "+kindLabel(kind)+" verification", 9)
	}
	return nil
}

func kindLabel(kind string) string {
	switch kind {
	case "email":
		return "email (registration)"
	case "biometric":
		return "biometric"
	case "kyc_aml":
		return "KYC/AML"
	}
	return kind
}

// MeVerification returns the caller's per-kind verification statuses and the
// capabilities they unlock. Drives the guest → registered → paying → money model:
// guests can only host a game; email unlocks clubs; biometric unlocks paying +
// marketplace; KYC/AML unlocks deposits (fiat AND crypto) + withdrawal. No
// crypto exemption — real-money crypto gets the same AML posture as fiat.
func MeVerification(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	statuses, err := store.NewVerificationStore(db).Statuses(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	v := func(kind string) string {
		if s, ok := statuses[kind]; ok {
			return s
		}
		return "none"
	}
	email := v("email") == "verified"
	biometric := v("biometric") == "verified"
	kycAML := v("kyc_aml") == "verified"

	out, _ := json.Marshal(map[string]any{
		// enforced = a provider is configured; the UI only gates by capability when
		// true (otherwise everything stays visible, matching backend dormant mode).
		"enforced": integrations.DiditConfigured(),
		"verifications": map[string]string{
			"email":     v("email"),
			"biometric": v("biometric"),
			"kyc_aml":   v("kyc_aml"),
		},
		"capabilities": map[string]bool{
			"host_game":    true,      // even unregistered guests can set up a game
			"clubs":        email,     // registration
			"pay":          biometric, // paying for services
			"marketplace":  biometric, // marketplace buy/sell
			"deposit_fiat":   kycAML, // buying with fiat
			"deposit_crypto": kycAML, // buying with crypto — same KYC/AML floor
			"withdraw":       kycAML, // receiving money
		},
	})
	return string(out), nil
}
