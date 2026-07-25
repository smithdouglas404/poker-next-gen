package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Guest table reconciliation. A guest (no registered account) who sits at a club's
// private/coded table is recorded as an open guest-session (written from the match
// sit-down path). The club operator reviews open sessions and reconciles each,
// which reads the guest's net position from the double-entry ledger and closes the
// row. Only a club owner/configurer may list or reconcile — mirrors the
// credit-request owner gate; reconciliation is atomic (settles once).

// GuestSessionsPending lists a club's open (unreconciled) guest sessions.
func GuestSessionsPending(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	list, err := store.NewGuestSessionStore(db).ListOpen(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Surface each guest's current ledger net alongside the row so the operator
	// sees the live position before reconciling.
	ledger := store.NewLedgerStore(db)
	type row struct {
		store.GuestSession
		LedgerNetMinor int64 `json:"ledger_net_minor"`
	}
	out := make([]row, 0, len(list))
	for _, g := range list {
		net, _ := ledger.Balance(ctx, "user:"+g.UserID)
		out = append(out, row{GuestSession: g, LedgerNetMinor: net})
	}
	b, _ := json.Marshal(map[string]interface{}{"sessions": out})
	return string(b), nil
}

// GuestSessionReconcile closes an open guest session, recording the guest's net
// position (from the ledger) at settle time. Owner/configurer only; idempotent.
func GuestSessionReconcile(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	gss := store.NewGuestSessionStore(db)
	g, err := gss.Get(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if g == nil || g.Status != "open" {
		return "", runtime.NewError("guest session not found or already reconciled", 5)
	}
	reviewer, err := requireClubConfigurer(ctx, db, g.ClubID)
	if err != nil {
		return "", err
	}
	net, err := store.NewLedgerStore(db).Balance(ctx, "user:"+g.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	ok, err := gss.Reconcile(ctx, req.ID, reviewer, net)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("guest session already reconciled", 9)
	}
	b, _ := json.Marshal(map[string]interface{}{"ok": true, "net_minor": net})
	return string(b), nil
}
