package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// AllianceCreate founds an alliance owned by a club the caller configures. The
// founding club becomes the alliance's first member.
func AllianceCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Name           string `json:"name"`
		FoundingClubID string `json:"founding_club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.Name == "" || req.FoundingClubID == "" {
		return "", runtime.NewError("name and founding_club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.FoundingClubID); err != nil {
		return "", err
	}
	a := &store.Alliance{Name: req.Name, FoundingClubID: req.FoundingClubID}
	if err := store.NewAllianceStore(db).Create(ctx, a); err != nil {
		logger.Error("alliance create: %v", err)
		return "", runtime.NewError("failed to create alliance (a founding club may already be in an alliance)", 13)
	}
	out, _ := json.Marshal(a)
	return string(out), nil
}

// AllianceList returns all alliances.
func AllianceList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	alliances, err := store.NewAllianceStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"alliances": alliances})
	return string(out), nil
}

// AllianceGet returns an alliance and its member clubs.
func AllianceGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	as := store.NewAllianceStore(db)
	a, err := as.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return "", runtime.NewError("alliance not found", 5)
	}
	members, _ := as.ListMembers(ctx, req.ID)
	out, _ := json.Marshal(map[string]interface{}{"alliance": a, "members": members})
	return string(out), nil
}

// AllianceUpdate renames an alliance (founding-club configurer only).
func AllianceUpdate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	if req.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	as := store.NewAllianceStore(db)
	a, err := as.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return "", runtime.NewError("alliance not found", 5)
	}
	if _, err := requireClubConfigurer(ctx, db, a.FoundingClubID); err != nil {
		return "", err
	}
	if err := as.UpdateName(ctx, req.ID, req.Name); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	a.Name = req.Name
	out, _ := json.Marshal(map[string]interface{}{"alliance": a})
	return string(out), nil
}

// AllianceJoin enrolls a club (the caller must configure it) into an alliance.
func AllianceJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		AllianceID string `json:"alliance_id"`
		ClubID     string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.AllianceID == "" || req.ClubID == "" {
		return "", runtime.NewError("alliance_id and club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	as := store.NewAllianceStore(db)
	a, err := as.GetByID(ctx, req.AllianceID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return "", runtime.NewError("alliance not found", 5)
	}
	if err := as.AddMember(ctx, req.AllianceID, req.ClubID); err != nil {
		return "", runtime.NewError("failed to join (club may already be in an alliance)", 13)
	}
	return `{"ok":true}`, nil
}

// AllianceRemoveClub removes a club from an alliance. Allowed for a configurer
// of the founding club (kick) or a configurer of the club leaving.
func AllianceRemoveClub(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		AllianceID string `json:"alliance_id"`
		ClubID     string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.AllianceID == "" || req.ClubID == "" {
		return "", runtime.NewError("alliance_id and club_id required", 3)
	}
	as := store.NewAllianceStore(db)
	a, err := as.GetByID(ctx, req.AllianceID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return "", runtime.NewError("alliance not found", 5)
	}
	// Configurer of either the founding club or the departing club may act.
	_, errFounder := requireClubConfigurer(ctx, db, a.FoundingClubID)
	_, errSelf := requireClubConfigurer(ctx, db, req.ClubID)
	if errFounder != nil && errSelf != nil {
		return "", runtime.NewError("forbidden: not a configurer of the alliance or the club", 7)
	}
	if err := as.RemoveMember(ctx, req.AllianceID, req.ClubID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// AllianceDelete disbands an alliance (founding-club configurer only).
func AllianceDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	as := store.NewAllianceStore(db)
	a, err := as.GetByID(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return "", runtime.NewError("alliance not found", 5)
	}
	if _, err := requireClubConfigurer(ctx, db, a.FoundingClubID); err != nil {
		return "", err
	}
	if err := as.Delete(ctx, req.ID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// ClubAllianceGet returns the alliance a club belongs to (or null).
func ClubAllianceGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	as := store.NewAllianceStore(db)
	a, err := as.ForClub(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if a == nil {
		return `{"alliance":null}`, nil
	}
	members, _ := as.ListMembers(ctx, a.ID)
	out, _ := json.Marshal(map[string]interface{}{"alliance": a, "members": members})
	return string(out), nil
}
