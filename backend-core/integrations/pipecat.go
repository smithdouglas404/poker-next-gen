// Pipecat Cloud (https://pipecat.daily.co) hosts the AI table host's voice/LLM
// pipeline as a deployed agent image — this file only starts/stops a session
// of that already-deployed agent against a Daily room we already own (see
// daily.go), so there's no signaling/media-relay problem to solve here, only
// session lifecycle. Mirrors DailyConfigured/TripoConfigured's env-gated shape
// exactly, so the app runs fine — and callers degrade honestly — before the
// key (and PIPECAT_SERVICE_NAME, the name of the deployed agent image) are set.
//
// The exact start/stop request shape below matches Pipecat Cloud's documented
// "bring your own Daily room" pattern (POST .../v1/public/{service}/start with
// room_url/token in the body) as of this writing — confirm against the live
// Pipecat Cloud dashboard/docs for the account actually deploying the agent
// before relying on it in production, the same way every other third-party
// integration in this package should be spot-checked against its current API
// once real credentials exist.
package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const pipecatAPIBase = "https://api.pipecat.daily.co/v1/public"

// PipecatConfigured reports whether the AI table host is enabled.
func PipecatConfigured() bool {
	return os.Getenv("PIPECAT_API_KEY") != "" && os.Getenv("PIPECAT_SERVICE_NAME") != ""
}

func pipecatDo(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, pipecatAPIBase+path, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("PIPECAT_API_KEY"))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, err
}

// StartAgentSession starts a session of the already-deployed AI-host agent
// image, pointed at a Daily room and meeting token this backend already
// created (integrations.GetOrCreateRoom / CreateMeetingToken) rather than
// letting Pipecat Cloud provision its own room. backendBaseURL + httpKey +
// webhookSecret are handed to the bot as session args so it can call this
// backend's ai_host_narration_poll / ai_host_chat_post RPCs — the bot only
// ever makes OUTBOUND calls to us, never the reverse, so nothing depends on
// the bot's container being reachable from here.
func StartAgentSession(ctx context.Context, matchID, dailyRoomURL, dailyToken, backendBaseURL, httpKey, webhookSecret string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"createDailyRoom": false,
		"body": map[string]interface{}{
			"room_url":         dailyRoomURL,
			"token":            dailyToken,
			"match_id":         matchID,
			"backend_base_url": backendBaseURL,
			"http_key":         httpKey,
			"webhook_secret":   webhookSecret,
		},
	})
	raw, status, err := pipecatDo(ctx, http.MethodPost, "/"+os.Getenv("PIPECAT_SERVICE_NAME")+"/start", body)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", fmt.Errorf("pipecat start session failed: %d %s", status, string(raw))
	}
	var out struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.SessionID, nil
}

// StopAgentSession ends a running agent session. Best-effort — a table
// closing or the host toggling the AI host off should never fail on this
// cleanup call, and a stale session self-expires on Pipecat Cloud's side once
// its Daily room empties.
func StopAgentSession(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	_, _, err := pipecatDo(ctx, http.MethodDelete, "/"+os.Getenv("PIPECAT_SERVICE_NAME")+"/sessions/"+sessionID, nil)
	return err
}
