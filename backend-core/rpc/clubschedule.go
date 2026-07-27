package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Recurring "club night" scheduler (P9). An operator saves a table template with
// a weekday/time, then launches it on demand — mirroring how tournaments carry
// scheduled_at but start via a manual RPC. Auto-firing at the scheduled time is a
// deliberate follow-up (needs a match-loop poller or external cron). All three
// RPCs are club owner/configurer-gated.

// ClubScheduleCreate saves a recurring club-night template.
func ClubScheduleCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req store.ClubSchedule
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.Name == "" {
		return "", runtime.NewError("club_id and name required", 3)
	}
	author, err := requireClubPermission(ctx, db, req.ClubID, store.PermTables)
	if err != nil {
		return "", err
	}
	req.CreatedBy = author
	id, err := store.NewClubScheduleStore(db).Create(ctx, &req)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "id": id, "schedule": req})
	return string(out), nil
}

// ClubScheduleList lists a club's schedule templates.
func ClubScheduleList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	list, err := store.NewClubScheduleStore(db).ListForClub(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Resolve each template's next occurrence in the club's timezone. weekday +
	// "HH:MM" alone name no instant; until the club had a zone this was a time
	// nobody could actually compute, only display.
	tz := "UTC"
	if c, cerr := store.NewClubStore(db).GetByID(ctx, req.ClubID); cerr == nil && c != nil && c.Timezone != "" {
		tz = c.Timezone
	}
	store.AttachNextRuns(list, tz, time.Now().UTC())
	out, _ := json.Marshal(map[string]interface{}{"schedules": list, "timezone": tz})
	return string(out), nil
}

// ClubNightLaunchNow spins up a real table now from a saved template, using the
// same MatchCreate path as table_create, and returns a shareable room code.
func ClubNightLaunchNow(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	sch, err := store.NewClubScheduleStore(db).Get(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if sch == nil {
		return "", runtime.NewError("schedule not found", 5)
	}
	host, err := requireClubPermission(ctx, db, sch.ClubID, store.PermTables)
	if err != nil {
		return "", err
	}

	roomID := sch.Name
	if roomID == "" {
		roomID = fmt.Sprintf("club-night-%d", sch.BigBlind)
	}
	buyIn := sch.BuyIn
	if buyIn <= 0 {
		buyIn = 100000
	}
	variant := sch.Variant
	if variant == "" {
		variant = "holdem"
	}
	maxSeats := sch.MaxSeats
	if maxSeats <= 0 {
		maxSeats = 6
	}

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
		"room_id":      roomID,
		"club_id":      sch.ClubID,
		"small_blind":  sch.SmallBlind,
		"big_blind":    sch.BigBlind,
		"buy_in":       buyIn,
		"min_buy_in":   buyIn,
		"max_buy_in":   buyIn * 4,
		"max_seats":    maxSeats,
		"min_players":  2,
		"variant":      variant,
		"host_user_id": host,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	code, _ := store.NewRoomCodeStore(db).Create(ctx, matchID)
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "match_id": matchID, "code": code})
	return string(out), nil
}
