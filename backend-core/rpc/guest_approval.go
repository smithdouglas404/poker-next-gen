package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Operator-facing approval of coded guests.
//
// A visitor with a table code and no registered account can watch immediately
// but cannot sit until an operator says so. These two RPCs are the operator's
// side of that; the enforcement itself lives in the match handler's sit-down
// gate, because that is the only place a seat is actually granted. An RPC that
// merely records a decision is not a gate.

// GuestApprovalsPending lists a club's coded guests waiting to sit.
//
// Same permission as the reconciliation queue it sits beside: whoever may
// configure the club. A player seated at the table is usually mid-hand and a
// poor approver — they will wave people through to get back to their cards —
// so the queue is aimed at operators, not at whoever happens to be hosting.
func GuestApprovalsPending(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	list, err := store.NewGuestApprovalStore(db).ListPending(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"pending": list, "count": len(list)})
	return string(out), nil
}

// GuestApprovalDecide approves or denies one waiting guest.
//
// Returns the decided row so the caller can render the outcome without a
// refetch. A second decision on the same request is reported as a conflict
// rather than silently overwriting the first — if two operators clicked
// opposite buttons, the one who lost needs to know their click did nothing.
func GuestApprovalDecide(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID  string `json:"club_id"`
		MatchID string `json:"match_id"`
		UserID  string `json:"user_id"`
		Approve bool   `json:"approve"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.MatchID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id, match_id and user_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	status := store.GuestApprovalDenied
	if req.Approve {
		status = store.GuestApprovalApproved
	}
	g, err := store.NewGuestApprovalStore(db).Decide(ctx, req.MatchID, req.UserID, status, caller, req.Reason)
	if errors.Is(err, store.ErrGuestApprovalDecided) {
		return "", runtime.NewError("this request was already decided by someone else", 6)
	}
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"approval": g})
	return string(out), nil
}

// GuestApprovalStatus lets the WAITING GUEST poll their own request.
//
// Deliberately not behind the operator permission: it answers only about the
// caller's own row, and without it a guest sits staring at a table with no idea
// whether anyone is coming. Returns "none" when there is no request, which is
// the normal answer for a registered member who never needed one.
func GuestApprovalStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID string `json:"match_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	g, err := store.NewGuestApprovalStore(db).Get(ctx, req.MatchID, caller)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	status := "none"
	if g != nil {
		status = g.Status
	}
	out, _ := json.Marshal(map[string]any{"status": status})
	return string(out), nil
}
