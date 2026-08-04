package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Club table settlement — who pays whom when a club game ends.
//
// Club chips are a LOAN the club extends; the global wallet is the player's own
// deposited money. So a club game does not balance itself when the last hand
// ends. Every player who drew club chips is up or down against what they were
// advanced, and the operator has to see that list and sign it off.
//
// The arithmetic lives in SettlementStore, accumulated at cash-out time by the
// match handler. These RPCs only read it and record the sign-off — same shape
// as the guest-approval pair next door.

// TableSettlementList returns a club's games whose books are not yet signed off.
//
// Same permission as every other operator queue: whoever may configure the
// club. Each entry already carries its per-player lines, so the hub can render
// the who-pays-whom list without a second round trip per game.
func TableSettlementList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	list, err := store.NewSettlementStore(db).ListOpen(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"settlements": list, "count": len(list)})
	return string(out), nil
}

// TableSettlementGet returns one table's settlement, lines included.
func TableSettlementGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ClubID  string `json:"club_id"`
		MatchID string `json:"match_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.MatchID == "" {
		return "", runtime.NewError("club_id and match_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	st, err := store.NewSettlementStore(db).Get(ctx, req.ClubID, req.MatchID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"settlement": st})
	return string(out), nil
}

// TableSettlementConfirm records the operator's "books balanced" sign-off.
//
// Returns the confirmed settlement so the caller can render the outcome without
// a refetch. A second confirmation is reported as a conflict rather than
// silently re-stamping the row — if two operators clicked at once, the one who
// lost needs to know their click did nothing.
func TableSettlementConfirm(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID  string `json:"club_id"`
		MatchID string `json:"match_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.MatchID == "" {
		return "", runtime.NewError("club_id and match_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	st, err := store.NewSettlementStore(db).Confirm(ctx, req.ClubID, req.MatchID, caller)
	if errors.Is(err, store.ErrSettlementConfirmed) {
		return "", runtime.NewError("these books were already confirmed by someone else", 6)
	}
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"settlement": st})
	return string(out), nil
}

// clubMemberPlayOnLoan reports whether this club seats its MEMBERS on
// club-issued chips (a loan) rather than requiring their own global wallet.
//
// Per-club, from the same settings blob clubReconcileWindowHours reads. Guests
// always draw club chips regardless — they have no certified wallet — so this
// decides members only.
//
// Defaults FALSE on any error or missing setting: a member then buys in from
// their own global wallet, which is the stricter, pre-existing behaviour. A
// wrong `false` costs a club the convenience of staking its members; a wrong
// `true` advances club credit nobody asked to extend.
func clubMemberPlayOnLoan(ctx context.Context, db *sql.DB, clubID string) bool {
	if clubID == "" {
		return false
	}
	ext, err := store.NewClubExtStore(db).GetExt(ctx, clubID)
	if err != nil || ext == nil || len(ext.SettingsJSON) == 0 {
		return false
	}
	var sj struct {
		MemberPlayOnLoan bool `json:"member_play_on_loan"`
	}
	if err := json.Unmarshal(ext.SettingsJSON, &sj); err != nil {
		return false
	}
	return sj.MemberPlayOnLoan
}
