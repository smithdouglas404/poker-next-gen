package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// requireAdmin gates platform-admin-only actions, mirroring the check used by
// kyc_verify_admin / withdrawal_approve_admin.
func requireAdmin(ctx context.Context) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(userID) {
		return "", runtime.NewError("forbidden", 7)
	}
	return userID, nil
}

// LeagueCreate opens a new competitive season (platform admin only).
func LeagueCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Name     string    `json:"name"`
		StartsAt time.Time `json:"starts_at"`
		EndsAt   time.Time `json:"ends_at"`
		Status   string    `json:"status"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	now := time.Now().UTC()
	if req.StartsAt.IsZero() {
		req.StartsAt = now
	}
	if req.EndsAt.IsZero() {
		req.EndsAt = now.Add(30 * 24 * time.Hour)
	}
	l := &store.League{Name: req.Name, StartsAt: req.StartsAt, EndsAt: req.EndsAt, Status: req.Status}
	if err := store.NewLeagueStore(db).Create(ctx, l); err != nil {
		logger.Error("league create: %v", err)
		return "", runtime.NewError("failed to create league", 13)
	}
	out, _ := json.Marshal(l)
	return string(out), nil
}

// LeagueList returns all leagues.
func LeagueList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	leagues, err := store.NewLeagueStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"leagues": leagues})
	return string(out), nil
}

// LeagueGet returns a league and its standings.
func LeagueGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	ls := store.NewLeagueStore(db)
	l, err := ls.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if l == nil {
		return "", runtime.NewError("league not found", 5)
	}
	standings, _ := ls.Standings(ctx, req.ID)
	out, _ := json.Marshal(map[string]interface{}{"league": l, "standings": standings})
	return string(out), nil
}

// LeagueUpdate patches a league's metadata/window/status (admin only).
func LeagueUpdate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID       string     `json:"id"`
		Name     string     `json:"name"`
		StartsAt *time.Time `json:"starts_at"`
		EndsAt   *time.Time `json:"ends_at"`
		Status   string     `json:"status"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	ls := store.NewLeagueStore(db)
	l, err := ls.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if l == nil {
		return "", runtime.NewError("league not found", 5)
	}
	if req.Name != "" {
		l.Name = req.Name
	}
	if req.StartsAt != nil {
		l.StartsAt = *req.StartsAt
	}
	if req.EndsAt != nil {
		l.EndsAt = *req.EndsAt
	}
	if req.Status != "" {
		if req.Status != "registering" && req.Status != "active" && req.Status != "completed" {
			return "", runtime.NewError("status must be registering|active|completed", 3)
		}
		l.Status = req.Status
	}
	if err := ls.Update(ctx, l); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"league": l})
	return string(out), nil
}

// LeagueDelete removes a league (admin only).
func LeagueDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	if err := store.NewLeagueStore(db).Delete(ctx, req.ID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// LeagueJoin enrolls a club (caller must configure it) into a league.
func LeagueJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		LeagueID string `json:"league_id"`
		ClubID   string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.LeagueID == "" || req.ClubID == "" {
		return "", runtime.NewError("league_id and club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	ls := store.NewLeagueStore(db)
	l, err := ls.GetByID(ctx, req.LeagueID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if l == nil {
		return "", runtime.NewError("league not found", 5)
	}
	if l.Status == "completed" {
		return "", runtime.NewError("league has ended", 9)
	}
	if err := ls.Join(ctx, req.LeagueID, req.ClubID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// LeagueStandingsSet upserts a club's absolute standing (admin override).
func LeagueStandingsSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		LeagueID string `json:"league_id"`
		ClubID   string `json:"club_id"`
		Points   int    `json:"points"`
		Wins     int    `json:"wins"`
		Losses   int    `json:"losses"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.LeagueID == "" || req.ClubID == "" {
		return "", runtime.NewError("league_id and club_id required", 3)
	}
	ls := store.NewLeagueStore(db)
	if err := ls.SetStanding(ctx, &store.LeagueStanding{
		LeagueID: req.LeagueID, ClubID: req.ClubID, Points: req.Points, Wins: req.Wins, Losses: req.Losses,
	}); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	standings, _ := ls.Standings(ctx, req.LeagueID)
	out, _ := json.Marshal(map[string]interface{}{"standings": standings})
	return string(out), nil
}

// LeagueComplete closes a league season (admin only).
func LeagueComplete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	ls := store.NewLeagueStore(db)
	l, err := ls.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if l == nil {
		return "", runtime.NewError("league not found", 5)
	}
	if err := ls.SetStatus(ctx, req.ID, "completed"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	standings, _ := ls.Standings(ctx, req.ID)
	var champion string
	if len(standings) > 0 {
		champion = standings[0].ClubID
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "champion_club_id": champion, "standings": standings})
	return string(out), nil
}
