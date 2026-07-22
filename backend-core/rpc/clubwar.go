package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// ClubwarSchedule proposes a war between two clubs. The caller must configure
// the challenging club (club_a); it starts 'pending' until club_b accepts.
func ClubwarSchedule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubA       string    `json:"club_a"`
		ClubB       string    `json:"club_b"`
		ScheduledAt time.Time `json:"scheduled_at"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubA == "" || req.ClubB == "" {
		return "", runtime.NewError("club_a and club_b required", 3)
	}
	if req.ClubA == req.ClubB {
		return "", runtime.NewError("a club cannot war itself", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubA); err != nil {
		return "", err
	}
	w := &store.ClubWar{ClubA: req.ClubA, ClubB: req.ClubB, Status: "pending", ScheduledAt: req.ScheduledAt}
	if err := store.NewClubWarStore(db).Create(ctx, w); err != nil {
		logger.Error("clubwar schedule: %v", err)
		return "", runtime.NewError("failed to schedule war", 13)
	}
	out, _ := json.Marshal(w)
	return string(out), nil
}

// ClubwarList returns wars, optionally filtered by club (either side) and status.
func ClubwarList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Status string `json:"status"`
	}
	_ = json.Unmarshal([]byte(payload), &req)
	wars, err := store.NewClubWarStore(db).List(ctx, req.ClubID, req.Status)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"wars": wars})
	return string(out), nil
}

// ClubwarGet returns a war and its per-hand deltas.
func ClubwarGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	cw := store.NewClubWarStore(db)
	w, err := cw.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if w == nil {
		return "", runtime.NewError("war not found", 5)
	}
	hands, _ := cw.Hands(ctx, req.ID)
	out, _ := json.Marshal(map[string]interface{}{"war": w, "hands": hands})
	return string(out), nil
}

// ClubwarAccept lets the challenged club (club_b) accept a pending war,
// transitioning it to 'active'. Caller must configure club_b.
func ClubwarAccept(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	cw := store.NewClubWarStore(db)
	w, err := cw.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if w == nil {
		return "", runtime.NewError("war not found", 5)
	}
	if w.Status != "pending" {
		return "", runtime.NewError("war is not pending", 9)
	}
	if _, err := requireClubConfigurer(ctx, db, w.ClubB); err != nil {
		return "", err
	}
	if err := cw.SetStatus(ctx, req.ID, "active"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	w.Status = "active"
	out, _ := json.Marshal(map[string]interface{}{"war": w})
	return string(out), nil
}

// ClubwarMatchmake (admin) activates a pending war, or directly creates an
// active war between two clubs. Used by the platform to kick off scheduled wars.
func ClubwarMatchmake(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID    string `json:"id"`
		ClubA string `json:"club_a"`
		ClubB string `json:"club_b"`
	}
	_ = json.Unmarshal([]byte(payload), &req)
	cw := store.NewClubWarStore(db)
	if req.ID != "" {
		w, err := cw.GetByID(ctx, req.ID)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		if w == nil {
			return "", runtime.NewError("war not found", 5)
		}
		if err := cw.SetStatus(ctx, req.ID, "active"); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		w.Status = "active"
		out, _ := json.Marshal(map[string]interface{}{"war": w})
		return string(out), nil
	}
	if req.ClubA == "" || req.ClubB == "" || req.ClubA == req.ClubB {
		return "", runtime.NewError("id, or distinct club_a and club_b, required", 3)
	}
	w := &store.ClubWar{ClubA: req.ClubA, ClubB: req.ClubB, Status: "active"}
	if err := cw.Create(ctx, w); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"war": w})
	return string(out), nil
}

// ClubwarResult (admin) settles a war: applies final scores (explicit override
// or the accumulated running score), decides the winner, and recomputes both
// clubs' ELO. Idempotent-safe on an already-completed war (returns current state).
func ClubwarResult(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID     string `json:"id"`
		ScoreA *int64 `json:"score_a"`
		ScoreB *int64 `json:"score_b"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	cw := store.NewClubWarStore(db)
	w, err := cw.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if w == nil {
		return "", runtime.NewError("war not found", 5)
	}
	if w.Status == "completed" {
		out, _ := json.Marshal(map[string]interface{}{"war": w, "already_settled": true})
		return string(out), nil
	}
	scoreA, scoreB := w.ScoreA, w.ScoreB
	if req.ScoreA != nil {
		scoreA = *req.ScoreA
	}
	if req.ScoreB != nil {
		scoreB = *req.ScoreB
	}

	// Determine outcome for ELO (1 win / 0.5 draw / 0 loss for club_a).
	var resultA float64
	winner := ""
	switch {
	case scoreA > scoreB:
		resultA, winner = 1.0, w.ClubA
	case scoreB > scoreA:
		resultA, winner = 0.0, w.ClubB
	default:
		resultA = 0.5
	}

	eloA, _ := cw.ClubELO(ctx, w.ClubA)
	eloB, _ := cw.ClubELO(ctx, w.ClubB)
	newA, newB := recomputeELO(eloA, eloB, resultA)
	_ = cw.SetClubELO(ctx, w.ClubA, newA)
	_ = cw.SetClubELO(ctx, w.ClubB, newB)

	if err := cw.Settle(ctx, req.ID, winner, scoreA, scoreB); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	w.Status = "completed"
	w.WinnerID = winner
	w.ScoreA, w.ScoreB = scoreA, scoreB
	out, _ := json.Marshal(map[string]interface{}{
		"war":        w,
		"elo_a":      newA,
		"elo_b":      newB,
		"prev_elo_a": eloA,
		"prev_elo_b": eloB,
	})
	return string(out), nil
}

// recomputeELO applies the standard ELO update (K=32) given club_a's result
// (1 win, 0.5 draw, 0 loss) and returns both clubs' new ratings.
func recomputeELO(eloA, eloB int, resultA float64) (int, int) {
	const k = 32.0
	expA := 1.0 / (1.0 + math.Pow(10, float64(eloB-eloA)/400.0))
	expB := 1.0 - expA
	newA := float64(eloA) + k*(resultA-expA)
	newB := float64(eloB) + k*((1.0-resultA)-expB)
	return int(math.Round(newA)), int(math.Round(newB))
}
