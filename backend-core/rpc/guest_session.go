package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// clubReconcileWindowHours reads a club's configurable reconciliation window (in
// hours) from its settings blob. 0 => no deadline (the operator reconciles at
// will). This is the "club specifies WHEN club-wallet grants must be reconciled"
// setting; the deadline is advisory (surfaced as due/overdue), not auto-enforced.
func clubReconcileWindowHours(ctx context.Context, db *sql.DB, clubID string) int {
	ext, err := store.NewClubExtStore(db).GetExt(ctx, clubID)
	if err != nil || ext == nil || len(ext.SettingsJSON) == 0 {
		return 0
	}
	var sj struct {
		ReconcileWindowHours int `json:"reconcile_window_hours"`
	}
	if err := json.Unmarshal(ext.SettingsJSON, &sj); err != nil || sj.ReconcileWindowHours < 0 {
		return 0
	}
	return sj.ReconcileWindowHours
}

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
	// sees the live position before reconciling, plus the club's reconciliation
	// deadline (created_at + configured window) and whether it is overdue.
	ledger := store.NewLedgerStore(db)
	windowHours := clubReconcileWindowHours(ctx, db, req.ClubID)
	now := time.Now()
	type row struct {
		store.GuestSession
		LedgerNetMinor int64      `json:"ledger_net_minor"`
		ReconcileDueAt *time.Time `json:"reconcile_due_at,omitempty"`
		Overdue        bool       `json:"overdue"`
	}
	out := make([]row, 0, len(list))
	for _, g := range list {
		net, _ := ledger.Balance(ctx, "user:"+g.UserID)
		r := row{GuestSession: g, LedgerNetMinor: net}
		if windowHours > 0 {
			due := g.CreatedAt.Add(time.Duration(windowHours) * time.Hour)
			r.ReconcileDueAt = &due
			r.Overdue = now.After(due)
		}
		out = append(out, r)
	}
	b, _ := json.Marshal(map[string]interface{}{"sessions": out, "reconcile_window_hours": windowHours})
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
