package rpc

// AI table host — a Pipecat Cloud voice/text agent. Three RPCs:
//
//   - ai_host_toggle: a real player action (host or club-admin of the
//     sponsoring club, resolved server-side via MatchSignal "can_admin", same
//     check OpHostAction's dispatch gate already uses). Blocking Daily/Pipecat
//     Cloud HTTP calls happen here, in RPC-land, never inside the match loop —
//     matches how VideoTokenGet already keeps external calls out of
//     MatchSignal/handleHostAction so a slow third-party response can't stall
//     every player's turn at the table.
//   - ai_host_narration_poll / ai_host_chat_post: called by the Pipecat bot
//     process itself, not a browser. The bot only ever makes OUTBOUND calls to
//     these (poll for new narration, post its own replies) — nothing depends
//     on the bot's container being reachable from here, whatever Pipecat
//     Cloud's session networking model turns out to be. Authenticated by the
//     per-table secret ai_host_toggle mints and hands the bot at session
//     start, not a Nakama session, since the bot isn't a real player.
import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
)

func AIHostToggle(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID string `json:"match_id"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}

	authSig, _ := json.Marshal(map[string]interface{}{"type": "can_admin", "user_id": userID})
	authResp, err := nk.MatchSignal(ctx, req.MatchID, string(authSig))
	if err != nil {
		return "", runtime.NewError("table not found", 5)
	}
	if authResp != "true" {
		return "", runtime.NewError("only the table host or a club admin of the sponsoring club can do that", 7)
	}

	if !req.Enabled {
		getResp, _ := nk.MatchSignal(ctx, req.MatchID, `{"type":"ai_host_get"}`)
		var cur struct {
			SessionID string `json:"session_id"`
		}
		_ = json.Unmarshal([]byte(getResp), &cur)
		if cur.SessionID != "" {
			_ = integrations.StopAgentSession(ctx, cur.SessionID)
		}
		setSig, _ := json.Marshal(map[string]interface{}{"type": "ai_host_set", "enabled": false})
		_, _ = nk.MatchSignal(ctx, req.MatchID, string(setSig))
		return `{"enabled":false}`, nil
	}

	if !integrations.PipecatConfigured() || !integrations.DailyConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"enabled": false,
			"message": "The AI table host is not currently available. Contact the platform administrator to enable this feature.",
		})
		return string(out), nil
	}

	room, err := integrations.GetOrCreateRoom(ctx, req.MatchID)
	if err != nil {
		logger.Error("ai_host_toggle: get/create room failed: %v", err)
		return "", runtime.NewError("could not prepare the table's voice room", 13)
	}
	token, err := integrations.CreateMeetingToken(ctx, req.MatchID, "ai-host", "AI Host", false)
	if err != nil {
		logger.Error("ai_host_toggle: create meeting token failed: %v", err)
		return "", runtime.NewError("could not issue the AI host a room token", 13)
	}
	secret, err := randomHexSecret(24)
	if err != nil {
		return "", runtime.NewError("internal error", 13)
	}

	backendBaseURL := os.Getenv("PIPECAT_BACKEND_BASE_URL")
	httpKey := os.Getenv("NAKAMA_HTTP_KEY")
	sessionID, err := integrations.StartAgentSession(ctx, req.MatchID, room.URL, token, backendBaseURL, httpKey, secret)
	if err != nil {
		logger.Error("ai_host_toggle: start agent session failed: %v", err)
		return "", runtime.NewError("could not start the AI host — try again shortly", 13)
	}

	setSig, _ := json.Marshal(map[string]interface{}{
		"type": "ai_host_set", "enabled": true, "session_id": sessionID, "webhook_secret": secret,
	})
	if _, err := nk.MatchSignal(ctx, req.MatchID, string(setSig)); err != nil {
		_ = integrations.StopAgentSession(ctx, sessionID)
		return "", runtime.NewError("AI host started but the table couldn't be updated — try again", 13)
	}
	return `{"enabled":true}`, nil
}

func randomHexSecret(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// AIHostNarrationPoll relays the bot's poll to the match, which validates the
// per-table secret and returns only public narrate() lines — never hole
// cards, never solver output, since narrate() itself never carries either.
func AIHostNarrationPoll(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		MatchID  string `json:"match_id"`
		Secret   string `json:"secret"`
		SinceSeq int64  `json:"since_seq"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	sig, _ := json.Marshal(map[string]interface{}{"type": "ai_host_poll", "secret": req.Secret, "since_seq": req.SinceSeq})
	resp, err := nk.MatchSignal(ctx, req.MatchID, string(sig))
	if err != nil {
		return "", runtime.NewError("table not found", 5)
	}
	return resp, nil
}

// AIHostChatPost relays the bot's own line into the table's real chat
// channel (Kind "ai_host") — the same channel narrate()'s dealer lines and
// players' own chat already share.
func AIHostChatPost(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		MatchID string `json:"match_id"`
		Secret  string `json:"secret"`
		Text    string `json:"text"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	if len(req.Text) > 500 {
		req.Text = req.Text[:500]
	}
	sig, _ := json.Marshal(map[string]interface{}{"type": "ai_host_reply", "secret": req.Secret, "text": req.Text})
	resp, err := nk.MatchSignal(ctx, req.MatchID, string(sig))
	if err != nil {
		return "", runtime.NewError("table not found", 5)
	}
	return resp, nil
}
