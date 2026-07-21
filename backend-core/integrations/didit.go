// Didit (https://didit.me) — identity verification / KYC. Progressive per-tier
// verification: each KYC level maps to a Didit *workflow* configured in the Didit
// dashboard, escalating the checks (basic = liveness + face match; standard =
// + phone + age; full = + ID + proof-of-address + AML; enhanced = + NFC passport
// + active liveness + biometric). Env-gated on DIDIT_API_KEY so the app runs fine
// before KYC is switched on. Never hardcode the key — it is read from the
// environment (set it in the Railway dashboard).
package integrations

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// DiditConfigured reports whether KYC verification is enabled.
func DiditConfigured() bool { return os.Getenv("DIDIT_API_KEY") != "" }

func diditBaseURL() string {
	if v := os.Getenv("DIDIT_BASE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "https://verification.didit.me"
}

// diditSessionPath is the create-session path (v2 default; override to /v3/session/
// via DIDIT_SESSION_PATH if the account uses the newer API).
func diditSessionPath() string {
	if v := os.Getenv("DIDIT_SESSION_PATH"); v != "" {
		return v
	}
	return "/v2/session/"
}

// Default Didit workflow ids for each verification kind. These are account-scoped
// configuration identifiers (NOT secrets — useless without DIDIT_API_KEY), baked
// so verification works as soon as the API key + webhook secret are set. Override
// any of them with the matching env var.
const (
	defaultWorkflowEmail     = "4de83718-1a62-450e-935e-c65a59a68099" // basic registration
	defaultWorkflowBiometric = "3e935904-d675-4bb9-896a-af618cbaae9f" // pay for services + marketplace
	defaultWorkflowKycAML    = "fe9718ad-9945-4a3c-a913-7a0d2892ace0" // receiving money / fiat buying
)

// VerificationKinds are the progressive identity checks a player can hold.
var VerificationKinds = []string{"email", "biometric", "kyc_aml"}

// DiditWorkflowFor maps a verification kind to its Didit workflow id (env override
// wins over the baked default).
func DiditWorkflowFor(kind string) string {
	switch strings.ToLower(kind) {
	case "email":
		return envOr("DIDIT_WORKFLOW_EMAIL", defaultWorkflowEmail)
	case "biometric":
		return envOr("DIDIT_WORKFLOW_BIOMETRIC", defaultWorkflowBiometric)
	case "kyc_aml", "kyc", "aml":
		return envOr("DIDIT_WORKFLOW_KYC_AML", defaultWorkflowKycAML)
	}
	return ""
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// DiditSession is the created verification session the player is sent to.
type DiditSession struct {
	SessionID string `json:"session_id"`
	URL       string `json:"url"`
	Status    string `json:"status"`
}

// CreateDiditSession opens a verification session for a user against a workflow,
// tagging it with our internal user id (vendor_data) so the webhook can map the
// result back. Returns the hosted verification URL to redirect the player to.
func CreateDiditSession(userID, workflowID, callback string) (DiditSession, error) {
	if !DiditConfigured() {
		return DiditSession{}, fmt.Errorf("didit not configured")
	}
	if workflowID == "" {
		return DiditSession{}, fmt.Errorf("no Didit workflow configured for this KYC level")
	}
	payload := map[string]string{"workflow_id": workflowID, "vendor_data": userID}
	if callback != "" {
		payload["callback"] = callback
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, diditBaseURL()+diditSessionPath(), bytes.NewReader(body))
	if err != nil {
		return DiditSession{}, err
	}
	req.Header.Set("x-api-key", os.Getenv("DIDIT_API_KEY"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return DiditSession{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return DiditSession{}, fmt.Errorf("didit session (%d): %s", resp.StatusCode, string(data))
	}
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	s := DiditSession{}
	if v, ok := raw["session_id"].(string); ok {
		s.SessionID = v
	}
	for _, k := range []string{"url", "verification_url", "session_url"} {
		if v, ok := raw[k].(string); ok && v != "" {
			s.URL = v
			break
		}
	}
	if v, ok := raw["status"].(string); ok {
		s.Status = v
	}
	return s, nil
}

// VerifyDiditSignature checks the X-Signature-Simple HMAC-SHA256 over
// "session_id|status|created_at" using DIDIT_WEBHOOK_SECRET.
func VerifyDiditSignature(sessionID, status, createdAt, signature string) bool {
	secret := os.Getenv("DIDIT_WEBHOOK_SECRET")
	if secret == "" || signature == "" {
		return false
	}
	msg := fmt.Sprintf("%s|%s|%s", sessionID, status, createdAt)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(signature)), []byte(expected))
}
