package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// adminCaller authorizes the caller as a platform admin (ADMIN_USER_IDS) and
// returns their user id. Every RPC in this file is admin-gated through it.
func adminCaller(ctx context.Context) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(userID) {
		return "", runtime.NewError("forbidden", 7)
	}
	return userID, nil
}

// adminAuditDetail writes an audit row for a mutating admin action; the value is
// JSON-encoded as the detail column. Failures to audit are logged, not fatal —
// the mutation has already applied — but should be rare.
func adminAuditDetail(ctx context.Context, logger runtime.Logger, db *sql.DB, adminID, action, target string, detail interface{}) {
	detailJSON := "{}"
	if detail != nil {
		if b, err := json.Marshal(detail); err == nil {
			detailJSON = string(b)
		}
	}
	if err := store.NewAdminStore(db).WriteAudit(ctx, adminID, action, target, detailJSON); err != nil {
		logger.Error("admin audit write failed (%s/%s): %v", action, target, err)
	}
}

// adminEnvKeys are the provider/integration env vars the console reports on. The
// console NEVER exposes values — only the key name and whether it is set.
var adminEnvKeys = []string{
	"DATABASE_URL",
	"ADMIN_USER_IDS",
	"APP_BASE_URL",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"NOWPAYMENTS_API_KEY",
	"NOWPAYMENTS_IPN_SECRET",
	"NOWPAYMENTS_PAYOUT_API_KEY",
	"DIDIT_API_KEY",
	"DIDIT_WEBHOOK_SECRET",
	"KYC_APPLY_SECRET",
	"TRIPO_API_KEY",
	"POLYGON_ANCHOR_URL",
	"POLYGON_ANCHOR_KEY",
	"ENGINE_MATH_URL",
}

// AdminFinancials returns the platform-wide money snapshot. Admin-gated.
func AdminFinancials(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	f, err := store.NewAdminStore(db).Financials(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"financials": f})
	return string(out), nil
}

// AdminUserSearch finds users by username/email/id. Admin-gated.
func AdminUserSearch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	users, err := store.NewAdminStore(db).SearchUsers(ctx, req.Query, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"users": users})
	return string(out), nil
}

// AdminUserAdjustWallet credits or debits a user's wallet by an admin
// adjustment (delta_cents, positive to credit, negative to debit). Admin-gated,
// audited.
func AdminUserAdjustWallet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID     string `json:"user_id"`
		DeltaCents int64  `json:"delta_cents"`
		Reason     string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" || req.DeltaCents == 0 {
		return "", runtime.NewError("user_id and non-zero delta_cents required", 3)
	}
	reason := req.Reason
	if reason == "" {
		reason = "admin_adjustment"
	}
	ws := store.NewWalletStore(db)
	if req.DeltaCents > 0 {
		if err := ws.Credit(ctx, req.UserID, req.DeltaCents, reason); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
	} else {
		if err := ws.Debit(ctx, req.UserID, -req.DeltaCents, reason); err != nil {
			if err.Error() == "insufficient balance" {
				return "", runtime.NewError("insufficient balance", 9)
			}
			return "", runtime.NewError(err.Error(), 13)
		}
	}
	bal, _ := ws.Get(ctx, req.UserID)
	adminAuditDetail(ctx, logger, db, adminID, "user_adjust_wallet", req.UserID, map[string]interface{}{
		"delta_cents": req.DeltaCents, "reason": reason, "balance_after": bal,
	})
	out, _ := json.Marshal(map[string]interface{}{
		"user_id": req.UserID, "balance_cents": bal, "balance": dollars(bal),
	})
	return string(out), nil
}

// AdminBan bans a user. Admin-gated, audited.
func AdminBan(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	if err := store.NewAdminStore(db).SetBan(ctx, req.UserID, true, req.Reason, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "user_ban", req.UserID, map[string]interface{}{"reason": req.Reason})
	return `{"ok":true,"banned":true}`, nil
}

// AdminUnban lifts a user's ban. Admin-gated, audited.
func AdminUnban(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	if err := store.NewAdminStore(db).SetBan(ctx, req.UserID, false, "", adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "user_unban", req.UserID, nil)
	return `{"ok":true,"banned":false}`, nil
}

// AdminClubDisable deactivates a club (is_active=false). Admin-gated, audited.
func AdminClubDisable(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if err := store.NewAdminStore(db).SetClubActive(ctx, req.ClubID, false); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "club_disable", req.ClubID, map[string]interface{}{"reason": req.Reason})
	return `{"ok":true}`, nil
}

// AdminTableClose signals a live match to close (refunding seated stacks between
// hands). Admin-gated, audited.
func AdminTableClose(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID string `json:"match_id"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	if _, err := nk.MatchSignal(ctx, req.MatchID, `{"type":"close"}`); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "table_close", req.MatchID, map[string]interface{}{"reason": req.Reason})
	return `{"ok":true}`, nil
}

// KycPendingList returns KYC submissions awaiting review. Admin-gated.
func KycPendingList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, err := store.NewAdminStore(db).KycPending(ctx, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"pending": items})
	return string(out), nil
}

// SystemLockGet reports whether the platform is locked (maintenance mode). Read
// is admin-gated (the lock itself is enforced elsewhere at login/seat gates).
func SystemLockGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	s, err := store.NewAdminStore(db).GetSetting(ctx, "system.lock")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	locked := false
	message := ""
	if s != nil {
		locked = s.Value == "on" || s.Value == "true" || s.Value == "1"
		if !locked && s.Value != "off" && s.Value != "" {
			message = s.Value
			locked = true
		}
	}
	msgSetting, _ := store.NewAdminStore(db).GetSetting(ctx, "system.lock_message")
	if msgSetting != nil {
		message = msgSetting.Value
	}
	out, _ := json.Marshal(map[string]interface{}{"locked": locked, "message": message})
	return string(out), nil
}

// SystemLockSet locks or unlocks the platform (maintenance mode). Admin-gated,
// audited.
func SystemLockSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Locked  bool   `json:"locked"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	as := store.NewAdminStore(db)
	val := "off"
	if req.Locked {
		val = "on"
	}
	if err := as.SetSetting(ctx, "system.lock", val, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if err := as.SetSetting(ctx, "system.lock_message", req.Message, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "system_lock_set", "system.lock", map[string]interface{}{
		"locked": req.Locked, "message": req.Message,
	})
	out, _ := json.Marshal(map[string]interface{}{"locked": req.Locked, "message": req.Message})
	return string(out), nil
}

// PlatformSettingsGet returns all platform key/value settings. Admin-gated.
func PlatformSettingsGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	settings, err := store.NewAdminStore(db).ListSettings(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"settings": settings})
	return string(out), nil
}

// PlatformSettingsSet upserts a platform key/value setting. Admin-gated,
// audited.
func PlatformSettingsSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Key == "" {
		return "", runtime.NewError("key required", 3)
	}
	if err := store.NewAdminStore(db).SetSetting(ctx, req.Key, req.Value, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "platform_setting_set", req.Key, map[string]interface{}{"value": req.Value})
	out, _ := json.Marshal(map[string]interface{}{"key": req.Key, "value": req.Value})
	return string(out), nil
}

// AdminEnvStatus reports which provider/integration env keys are set. It returns
// only key NAMES and a boolean — NEVER the values. Admin-gated.
func AdminEnvStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	status := make([]map[string]interface{}, 0, len(adminEnvKeys))
	for _, k := range adminEnvKeys {
		status = append(status, map[string]interface{}{"key": k, "set": os.Getenv(k) != ""})
	}
	out, _ := json.Marshal(map[string]interface{}{"env": status})
	return string(out), nil
}

// AdminAuditList returns recent admin actions. Admin-gated.
func AdminAuditList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Limit  int `json:"limit"`
		Offset int `json:"offset"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	rowsData, err := store.NewAdminStore(db).ListAudit(ctx, req.Limit, req.Offset)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"audit": rowsData})
	return string(out), nil
}

// HitlList returns human-in-the-loop review queue items (optionally by status).
// Admin-gated.
func HitlList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, err := store.NewAdminStore(db).ListHitl(ctx, req.Status, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"queue": items})
	return string(out), nil
}

// HitlReview records a human decision (approved|rejected) on a queue item.
// Admin-gated, audited.
func HitlReview(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	if req.Status != "approved" && req.Status != "rejected" {
		return "", runtime.NewError("status must be approved or rejected", 3)
	}
	as := store.NewAdminStore(db)
	item, err := as.GetHitl(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if item == nil {
		return "", runtime.NewError("queue item not found", 5)
	}
	if err := as.ReviewHitl(ctx, req.ID, req.Status, req.Note, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "hitl_review", req.ID, map[string]interface{}{
		"status": req.Status, "note": req.Note,
	})
	out, _ := json.Marshal(map[string]interface{}{"id": req.ID, "status": req.Status})
	return string(out), nil
}

// IPRuleList returns all IP allow/deny rules. Admin-gated.
func IPRuleList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	rules, err := store.NewAdminStore(db).ListIPRules(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"rules": rules})
	return string(out), nil
}

// IPRuleAdd inserts an IP allow/deny rule. Admin-gated, audited.
func IPRuleAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		CIDR   string `json:"cidr"`
		Rule   string `json:"rule"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.CIDR == "" {
		return "", runtime.NewError("cidr required", 3)
	}
	if req.Rule != "allow" && req.Rule != "deny" {
		return "", runtime.NewError("rule must be allow or deny", 3)
	}
	id, err := store.NewAdminStore(db).AddIPRule(ctx, req.CIDR, req.Rule, req.Reason, adminID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "ip_rule_add", id, map[string]interface{}{
		"cidr": req.CIDR, "rule": req.Rule, "reason": req.Reason,
	})
	out, _ := json.Marshal(map[string]interface{}{"id": id})
	return string(out), nil
}

// IPRuleDelete removes an IP rule. Admin-gated, audited.
func IPRuleDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	if err := store.NewAdminStore(db).DeleteIPRule(ctx, req.ID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "ip_rule_delete", req.ID, nil)
	return `{"ok":true}`, nil
}

// SponsorshipPayoutList returns settlements of kind 'sponsorship'. Admin-gated.
func SponsorshipPayoutList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, err := store.NewAdminStore(db).ListSettlements(ctx, "sponsorship", req.Status, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"payouts": items})
	return string(out), nil
}

// SponsorshipPayoutCreate records a pending sponsorship payout (a settlement of
// kind 'sponsorship'). Admin-gated, audited.
func SponsorshipPayoutCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Counterparty string `json:"counterparty"`
		AmountCents  int64  `json:"amount_cents"`
		Currency     string `json:"currency"`
		Reference    string `json:"reference"`
		Note         string `json:"note"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Counterparty == "" || req.AmountCents <= 0 {
		return "", runtime.NewError("counterparty and positive amount_cents required", 3)
	}
	id, err := store.NewAdminStore(db).CreateSettlement(ctx, "sponsorship", req.Reference, req.Counterparty, req.AmountCents, req.Currency, req.Note, "", adminID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "sponsorship_payout_create", id, map[string]interface{}{
		"counterparty": req.Counterparty, "amount_cents": req.AmountCents, "reference": req.Reference,
	})
	out, _ := json.Marshal(map[string]interface{}{"id": id, "status": "pending"})
	return string(out), nil
}

// SettlementList returns settlements (optionally by kind and status).
// Admin-gated.
func SettlementList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Kind   string `json:"kind"`
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, err := store.NewAdminStore(db).ListSettlements(ctx, req.Kind, req.Status, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"settlements": items})
	return string(out), nil
}

// SettlementVerify marks a settlement verified. Admin-gated, audited.
func SettlementVerify(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	as := store.NewAdminStore(db)
	st, err := as.GetSettlement(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if st == nil {
		return "", runtime.NewError("settlement not found", 5)
	}
	if err := as.VerifySettlement(ctx, req.ID, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "settlement_verify", req.ID, map[string]interface{}{
		"kind": st.Kind, "amount_cents": st.AmountCents,
	})
	out, _ := json.Marshal(map[string]interface{}{"id": req.ID, "status": "verified"})
	return string(out), nil
}

// AdminLedgerSearch scans the cross-user wallet ledger with optional filters.
// Admin-gated.
func AdminLedgerSearch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
		From   string `json:"from"`
		To     string `json:"to"`
		Limit  int    `json:"limit"`
		Offset int    `json:"offset"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	var from, to *time.Time
	if req.From != "" {
		if t, err := time.Parse(time.RFC3339, req.From); err == nil {
			from = &t
		}
	}
	if req.To != "" {
		if t, err := time.Parse(time.RFC3339, req.To); err == nil {
			to = &t
		}
	}
	entries, err := store.NewAdminStore(db).LedgerSearch(ctx, req.UserID, req.Reason, from, to, req.Limit, req.Offset)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"entries": entries})
	return string(out), nil
}
