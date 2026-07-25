package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Double-entry ledger RPCs (#88). Every wallet movement is mirrored into a
// balanced two-leg transaction (see WalletStore), so these endpoints expose an
// auditable, self-reconciling view of the chip economy: any account's balance is
// the sum of its postings, and the global trial balance is invariantly zero.

// LedgerTrialBalance returns every account's balance and the global total, which
// MUST be zero for a correct double-entry ledger. Admin-gated (full books).
func LedgerTrialBalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	accounts, total, err := store.NewLedgerStore(db).TrialBalance(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"accounts":   accounts,
		"total":      total,
		"balanced":   total == 0,
	})
	return string(out), nil
}

// LedgerBalance returns one account's balance. The caller may read their own
// "user:<id>" account; admins may read any account.
func LedgerBalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Account string `json:"account"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Account == "" {
		req.Account = "user:" + caller
	}
	if req.Account != "user:"+caller && !isAdmin(caller) {
		return "", runtime.NewError("forbidden", 7)
	}
	bal, err := store.NewLedgerStore(db).Balance(ctx, req.Account)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"account": req.Account, "balance_minor": bal})
	return string(out), nil
}

// LedgerEntries returns the posting audit trail for an account (own or admin).
func LedgerEntries(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Account string `json:"account"`
		Limit   int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Account == "" {
		req.Account = "user:" + caller
	}
	if req.Account != "user:"+caller && !isAdmin(caller) {
		return "", runtime.NewError("forbidden", 7)
	}
	entries, err := store.NewLedgerStore(db).Entries(ctx, req.Account, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"entries": entries})
	return string(out), nil
}

// LedgerTransfer posts a balanced transfer between two ledger accounts. Admin-only
// (a manual reconciliation/adjustment tool); rejected unless it balances.
func LedgerTransfer(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		From        string `json:"from"`
		To          string `json:"to"`
		AmountMinor int64  `json:"amount_minor"`
		Reason      string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.From == "" || req.To == "" || req.AmountMinor <= 0 {
		return "", runtime.NewError("from, to, positive amount_minor required", 3)
	}
	id, err := store.NewLedgerStore(db).Transfer(ctx, req.From, req.To, req.AmountMinor, "adjustment", admin, req.Reason)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, admin, "ledger_transfer", id, req)
	return `{"ok":true,"txn_id":"` + id + `"}`, nil
}
