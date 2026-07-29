// Daily.co (https://www.daily.co) hosts the video-chat rooms for live tables —
// signaling, TURN, and media relay all run on their side, so this file only
// needs to create/fetch a private room per table and issue per-user meeting
// tokens. Ported from the reference HighRollersClub implementation
// (server/video/daily-rooms.ts); env-gated on DAILY_API_KEY exactly like
// TripoConfigured/DailyConfigured elsewhere in this package, so the app runs
// fine — and callers degrade honestly — before the key is set.
package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

const dailyAPIBase = "https://api.daily.co/v1"

type DailyRoom struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	ID   string `json:"id"`
}

// activeRooms caches tableId(matchId) -> Daily room info. Mutex-guarded unlike
// the reference's plain JS Map — Nakama plugins run concurrent goroutines.
var (
	activeRoomsMu sync.Mutex
	activeRooms   = map[string]DailyRoom{}
)

// DailyConfigured reports whether video chat is enabled.
func DailyConfigured() bool {
	return os.Getenv("DAILY_API_KEY") != ""
}

func dailyDo(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, dailyAPIBase+path, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("DAILY_API_KEY"))
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

func fetchRoom(ctx context.Context, roomName string) (*DailyRoom, error) {
	raw, status, err := dailyDo(ctx, http.MethodGet, "/rooms/"+roomName, nil)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return nil, nil
	}
	if status >= 300 {
		return nil, fmt.Errorf("daily fetch room http %d: %s", status, string(raw))
	}
	var room DailyRoom
	if err := json.Unmarshal(raw, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

func createRoom(ctx context.Context, roomName string) (*DailyRoom, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"name":    roomName,
		"privacy": "private",
		"properties": map[string]interface{}{
			"exp":              time.Now().Add(4 * time.Hour).Unix(),
			"enable_recording": "cloud",
			"enable_chat":      false,
			"max_participants": 10,
			"start_video_off":  false,
			"start_audio_off":  false,
		},
	})
	raw, status, err := dailyDo(ctx, http.MethodPost, "/rooms", body)
	if err != nil {
		return nil, err
	}
	if status >= 300 {
		return nil, fmt.Errorf("daily room creation failed: %d %s", status, string(raw))
	}
	var room DailyRoom
	if err := json.Unmarshal(raw, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

// GetOrCreateRoom returns the private Daily room for a table (matchID), fetching
// the cached/existing room or creating a fresh one (named "poker-<matchID>").
func GetOrCreateRoom(ctx context.Context, matchID string) (*DailyRoom, error) {
	activeRoomsMu.Lock()
	if cached, ok := activeRooms[matchID]; ok {
		activeRoomsMu.Unlock()
		return &cached, nil
	}
	activeRoomsMu.Unlock()

	roomName := "poker-" + matchID
	existing, err := fetchRoom(ctx, roomName)
	if err != nil {
		return nil, err
	}
	room := existing
	if room == nil {
		room, err = createRoom(ctx, roomName)
		if err != nil {
			return nil, err
		}
	}

	activeRoomsMu.Lock()
	activeRooms[matchID] = *room
	activeRoomsMu.Unlock()
	return room, nil
}

// CreateMeetingToken issues a per-user Daily meeting token for a table's room.
// isOwner must be resolved authoritatively server-side (the match's real
// HostUserID, via a MatchSignal) — it is what Daily uses to decide who may
// start cloud recording, so it must never come from a client-supplied claim.
func CreateMeetingToken(ctx context.Context, matchID, userID, displayName string, isOwner bool) (string, error) {
	room, err := GetOrCreateRoom(ctx, matchID)
	if err != nil {
		return "", err
	}
	body, _ := json.Marshal(map[string]interface{}{
		"properties": map[string]interface{}{
			"room_name": room.Name,
			"user_name": displayName,
			"user_id":   userID,
			"is_owner":  isOwner,
			"exp":       time.Now().Add(4 * time.Hour).Unix(),
		},
	})
	raw, status, err := dailyDo(ctx, http.MethodPost, "/meeting-tokens", body)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", fmt.Errorf("daily token creation failed: %d %s", status, string(raw))
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.Token, nil
}

// DeleteRoom removes a table's Daily room (best-effort — a table closing
// should never fail on video cleanup; the room also self-expires via `exp`).
func DeleteRoom(ctx context.Context, matchID string) {
	roomName := "poker-" + matchID
	activeRoomsMu.Lock()
	delete(activeRooms, matchID)
	activeRoomsMu.Unlock()
	_, _, _ = dailyDo(ctx, http.MethodDelete, "/rooms/"+roomName, nil)
}
