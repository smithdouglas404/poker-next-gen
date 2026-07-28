package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// consentKinds are the disclosures a player can sign off on. Bump the version
// string (not the kind) when the copy materially changes — a version bump
// re-prompts everyone, an old acceptance under the prior version no longer
// satisfies ConsentStore.Has for the new one.
var consentKinds = map[string]string{
	"signup_tos":              "1", // age/ToS/privacy/gambling-risk disclosure at registration
	"kyc_document_processing": "1", // Didit processing a government ID / biometric capture
}

// ConsentRecord stores the caller's acceptance of a disclosure (kind + the
// CURRENT version only — a client cannot back-date an acceptance to an older
// version). Idempotent.
func ConsentRecord(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Kind string `json:"kind"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	version, ok := consentKinds[req.Kind]
	if !ok {
		return "", runtime.NewError("unknown consent kind", 3)
	}
	if err := store.NewConsentStore(db).Record(ctx, userID, req.Kind, version); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"ok": true, "kind": req.Kind, "version": version})
	return string(out), nil
}

// ConsentStatus returns which of the current-version disclosures the caller
// has already accepted, so a screen can skip a re-prompt within one session.
func ConsentStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	cs := store.NewConsentStore(db)
	accepted := map[string]bool{}
	for kind, version := range consentKinds {
		ok, err := cs.Has(ctx, userID, kind, version)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		accepted[kind] = ok
	}
	out, _ := json.Marshal(map[string]any{"accepted": accepted})
	return string(out), nil
}
