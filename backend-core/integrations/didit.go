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

// DiditWorkflowFor maps a KYC level to its configured Didit workflow id.
func DiditWorkflowFor(level string) string {
	switch strings.ToLower(level) {
	case "basic":
		return os.Getenv("DIDIT_WORKFLOW_BASIC")
	case "standard":
		return os.Getenv("DIDIT_WORKFLOW_STANDARD")
	case "full":
		return os.Getenv("DIDIT_WORKFLOW_FULL")
	case "enhanced":
		return os.Getenv("DIDIT_WORKFLOW_ENHANCED")
	}
	return ""
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
