package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// AdminStore backs the platform admin console: user ban status, platform
// key/value settings, the admin audit trail, IP allow/deny rules, the
// human-in-the-loop (HITL) review queue, and manual settlements (including
// sponsorship payouts). It wraps the shared *sql.DB following the same pattern
// as the other stores.
type AdminStore struct{ db *sql.DB }

func NewAdminStore(db *sql.DB) *AdminStore { return &AdminStore{db: db} }

// --- Audit trail ---

// AdminAuditRow is one entry in the admin action log.
type AdminAuditRow struct {
	ID          string          `json:"id"`
	AdminUserID string          `json:"admin_user_id"`
	Action      string          `json:"action"`
	Target      string          `json:"target"`
	Detail      json.RawMessage `json:"detail"`
	CreatedAt   time.Time       `json:"created_at"`
}

// WriteAudit records a mutating admin action. detailJSON must be valid JSON (or
// empty, which is normalized to "{}"). Best-effort callers may ignore the error,
// but the mutation and its audit row should be treated as a pair.
func (s *AdminStore) WriteAudit(ctx context.Context, adminUserID, action, target, detailJSON string) error {
	if detailJSON == "" {
		detailJSON = "{}"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_admin_audit (id, admin_user_id, action, target, detail, created_at)
		VALUES ($1,$2,$3,$4,$5,NOW())`,
		NewID("aud"), adminUserID, action, target, detailJSON)
	return err
}

// ListAudit returns the most recent admin actions, newest first.
func (s *AdminStore) ListAudit(ctx context.Context, limit, offset int) ([]AdminAuditRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, admin_user_id, action, target, detail, created_at
		FROM poker_admin_audit ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminAuditRow{}
	for rows.Next() {
		var r AdminAuditRow
		if err := rows.Scan(&r.ID, &r.AdminUserID, &r.Action, &r.Target, &r.Detail, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- User status / bans ---

// AdminUserStatus is a user's ban state.
type AdminUserStatus struct {
	UserID    string    `json:"user_id"`
	Banned    bool      `json:"banned"`
	Reason    string    `json:"reason"`
	BannedBy  string    `json:"banned_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetUserStatus returns a user's ban status, or (nil, nil) if none recorded.
func (s *AdminStore) GetUserStatus(ctx context.Context, userID string) (*AdminUserStatus, error) {
	var st AdminUserStatus
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id, banned, reason, banned_by, updated_at
		FROM poker_user_status WHERE user_id=$1`, userID).
		Scan(&st.UserID, &st.Banned, &st.Reason, &st.BannedBy, &st.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// SetBan upserts a user's ban state (banned=true to ban, false to unban).
func (s *AdminStore) SetBan(ctx context.Context, userID string, banned bool, reason, adminUserID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_user_status (user_id, banned, reason, banned_by, updated_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (user_id) DO UPDATE SET banned=EXCLUDED.banned, reason=EXCLUDED.reason,
		  banned_by=EXCLUDED.banned_by, updated_at=NOW()`,
		userID, banned, reason, adminUserID)
	return err
}

// AdminUserRow is a user-search result row.
type AdminUserRow struct {
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	Banned       bool   `json:"banned"`
	BalanceCents int64  `json:"balance_cents"`
}

// SearchUsers finds users by username / email substring or exact id, joining
// ban status and wallet balance. Reads Nakama's own `users` table (there is no
// runtime "search accounts" API). An empty query returns the most recent users.
func (s *AdminStore) SearchUsers(ctx context.Context, query string, limit int) ([]AdminUserRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.username, COALESCE(u.email,''),
		       COALESCE(st.banned, FALSE), COALESCE(w.balance, 0)
		FROM users u
		LEFT JOIN poker_user_status st ON st.user_id = u.id
		LEFT JOIN poker_global_wallet w ON w.user_id = u.id
		WHERE $1 = '' OR u.username ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%' OR u.id::text = $1
		ORDER BY u.create_time DESC LIMIT $2`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUserRow{}
	for rows.Next() {
		var r AdminUserRow
		if err := rows.Scan(&r.UserID, &r.Username, &r.Email, &r.Banned, &r.BalanceCents); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetClubActive enables/disables a club (admin override of is_active).
func (s *AdminStore) SetClubActive(ctx context.Context, clubID string, active bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_club SET is_active=$2, updated_at=NOW() WHERE id=$1`, clubID, active)
	return err
}

// --- Platform settings (key/value) ---

// PlatformSetting is a single platform configuration key/value pair.
type PlatformSetting struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	UpdatedBy string    `json:"updated_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetSetting returns a setting by key, or (nil, nil) if unset.
func (s *AdminStore) GetSetting(ctx context.Context, key string) (*PlatformSetting, error) {
	var p PlatformSetting
	err := s.db.QueryRowContext(ctx, `
		SELECT key, value, updated_by, updated_at FROM poker_platform_setting WHERE key=$1`, key).
		Scan(&p.Key, &p.Value, &p.UpdatedBy, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// SetSetting upserts a platform setting.
func (s *AdminStore) SetSetting(ctx context.Context, key, value, adminUserID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_platform_setting (key, value, updated_by, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
		key, value, adminUserID)
	return err
}

// ListSettings returns all platform settings, keyed alphabetically.
func (s *AdminStore) ListSettings(ctx context.Context) ([]PlatformSetting, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT key, value, updated_by, updated_at FROM poker_platform_setting ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlatformSetting{}
	for rows.Next() {
		var p PlatformSetting
		if err := rows.Scan(&p.Key, &p.Value, &p.UpdatedBy, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// --- Financials ---

// AdminFinancials is a platform-wide money snapshot (all values in minor units).
type AdminFinancials struct {
	DepositsCreditedCents   int64 `json:"deposits_credited_cents"`
	WithdrawalsPaidCents    int64 `json:"withdrawals_paid_cents"`
	WithdrawalsPendingCents int64 `json:"withdrawals_pending_cents"`
	WalletFloatCents        int64 `json:"wallet_float_cents"`
	RakeCollectedCents      int64 `json:"rake_collected_cents"`
	UserCount               int64 `json:"user_count"`
	BannedCount             int64 `json:"banned_count"`
}

// Financials aggregates the platform money position from the deposit /
// withdrawal / wallet / rake ledgers.
func (s *AdminStore) Financials(ctx context.Context) (*AdminFinancials, error) {
	var f AdminFinancials
	q := func(dst *int64, sql string, args ...interface{}) error {
		return s.db.QueryRowContext(ctx, sql, args...).Scan(dst)
	}
	if err := q(&f.DepositsCreditedCents,
		`SELECT COALESCE(SUM(amount_cents),0) FROM poker_deposit WHERE status='credited'`); err != nil {
		return nil, err
	}
	if err := q(&f.WithdrawalsPaidCents,
		`SELECT COALESCE(SUM(amount_cents),0) FROM poker_withdrawal WHERE status='paid'`); err != nil {
		return nil, err
	}
	if err := q(&f.WithdrawalsPendingCents,
		`SELECT COALESCE(SUM(amount_cents),0) FROM poker_withdrawal WHERE status='pending'`); err != nil {
		return nil, err
	}
	if err := q(&f.WalletFloatCents,
		`SELECT COALESCE(SUM(balance),0) FROM poker_global_wallet`); err != nil {
		return nil, err
	}
	if err := q(&f.RakeCollectedCents,
		`SELECT COALESCE(SUM(amount),0) FROM poker_rake_ledger`); err != nil {
		return nil, err
	}
	if err := q(&f.UserCount, `SELECT COUNT(*) FROM users`); err != nil {
		return nil, err
	}
	if err := q(&f.BannedCount, `SELECT COUNT(*) FROM poker_user_status WHERE banned`); err != nil {
		return nil, err
	}
	return &f, nil
}

// AdminLedgerRow is a cross-user wallet ledger entry (with owning user).
type AdminLedgerRow struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Delta        int64     `json:"delta"`
	BalanceAfter int64     `json:"balance_after"`
	Reason       string    `json:"reason"`
	CreatedAt    time.Time `json:"created_at"`
}

// LedgerSearch scans the cross-user wallet ledger with optional user_id, reason
// substring, and time-window filters, paged newest-first.
func (s *AdminStore) LedgerSearch(ctx context.Context, userID, reason string, from, to *time.Time, limit, offset int) ([]AdminLedgerRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, delta, balance_after, reason, created_at
		FROM poker_wallet_ledger
		WHERE ($1 = '' OR user_id = $1)
		  AND ($2 = '' OR reason ILIKE '%'||$2||'%')
		  AND ($3::timestamptz IS NULL OR created_at >= $3)
		  AND ($4::timestamptz IS NULL OR created_at <= $4)
		ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
		userID, reason, from, to, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminLedgerRow{}
	for rows.Next() {
		var r AdminLedgerRow
		if err := rows.Scan(&r.ID, &r.UserID, &r.Delta, &r.BalanceAfter, &r.Reason, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminKycPendingRow is a KYC submission awaiting admin decision.
type AdminKycPendingRow struct {
	UserID    string          `json:"user_id"`
	Level     string          `json:"level"`
	Status    string          `json:"status"`
	Data      json.RawMessage `json:"data"`
	Provider  string          `json:"provider"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// KycPending lists KYC records in the 'pending' state (oldest first — a review
// queue).
func (s *AdminStore) KycPending(ctx context.Context, limit int) ([]AdminKycPendingRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id, level, status, data, provider, updated_at
		FROM poker_kyc WHERE status='pending' ORDER BY updated_at ASC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminKycPendingRow{}
	for rows.Next() {
		var r AdminKycPendingRow
		if err := rows.Scan(&r.UserID, &r.Level, &r.Status, &r.Data, &r.Provider, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- IP allow/deny rules ---

// AdminIPRule is an IP/CIDR allow or deny rule.
type AdminIPRule struct {
	ID        string    `json:"id"`
	CIDR      string    `json:"cidr"`
	Rule      string    `json:"rule"` // "allow" | "deny"
	Reason    string    `json:"reason"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// ListIPRules returns all IP rules, newest first.
func (s *AdminStore) ListIPRules(ctx context.Context) ([]AdminIPRule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, cidr, rule, reason, created_by, created_at
		FROM poker_ip_rule ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminIPRule{}
	for rows.Next() {
		var r AdminIPRule
		if err := rows.Scan(&r.ID, &r.CIDR, &r.Rule, &r.Reason, &r.CreatedBy, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AddIPRule inserts an allow/deny rule and returns its id.
func (s *AdminStore) AddIPRule(ctx context.Context, cidr, rule, reason, adminUserID string) (string, error) {
	id := NewID("ipr")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_ip_rule (id, cidr, rule, reason, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,NOW())`, id, cidr, rule, reason, adminUserID)
	return id, err
}

// DeleteIPRule removes an IP rule by id.
func (s *AdminStore) DeleteIPRule(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_ip_rule WHERE id=$1`, id)
	return err
}

// --- HITL (human-in-the-loop) review queue ---

// AdminHitlItem is an item awaiting human review (flagged withdrawal, KYC edge
// case, suspicious activity, …).
type AdminHitlItem struct {
	ID            string          `json:"id"`
	Kind          string          `json:"kind"`
	SubjectUserID string          `json:"subject_user_id"`
	Payload       json.RawMessage `json:"payload"`
	Status        string          `json:"status"` // pending | approved | rejected
	Note          string          `json:"note"`
	ReviewedBy    string          `json:"reviewed_by"`
	ReviewedAt    *time.Time      `json:"reviewed_at"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ListHitl returns queue items, optionally filtered by status (empty = all),
// oldest first for pending review.
func (s *AdminStore) ListHitl(ctx context.Context, status string, limit int) ([]AdminHitlItem, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, subject_user_id, payload, status, note, reviewed_by, reviewed_at, created_at
		FROM poker_hitl_queue
		WHERE $1 = '' OR status = $1
		ORDER BY created_at ASC LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return adminScanHitl(rows)
}

// GetHitl returns a queue item, or (nil, nil) if missing.
func (s *AdminStore) GetHitl(ctx context.Context, id string) (*AdminHitlItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, subject_user_id, payload, status, note, reviewed_by, reviewed_at, created_at
		FROM poker_hitl_queue WHERE id=$1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items, err := adminScanHitl(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}
	return &items[0], nil
}

// ReviewHitl records a human decision (approved|rejected) on a queue item.
func (s *AdminStore) ReviewHitl(ctx context.Context, id, status, note, adminUserID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_hitl_queue SET status=$2, note=$3, reviewed_by=$4, reviewed_at=NOW()
		WHERE id=$1`, id, status, note, adminUserID)
	return err
}

func adminScanHitl(rows *sql.Rows) ([]AdminHitlItem, error) {
	out := []AdminHitlItem{}
	for rows.Next() {
		var h AdminHitlItem
		var reviewedAt sql.NullTime
		var reviewedBy sql.NullString
		if err := rows.Scan(&h.ID, &h.Kind, &h.SubjectUserID, &h.Payload, &h.Status,
			&h.Note, &reviewedBy, &reviewedAt, &h.CreatedAt); err != nil {
			return nil, err
		}
		if reviewedBy.Valid {
			h.ReviewedBy = reviewedBy.String
		}
		if reviewedAt.Valid {
			t := reviewedAt.Time
			h.ReviewedAt = &t
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// --- Settlements (incl. sponsorship payouts) ---

// AdminSettlement is a manual money settlement — sponsorship payouts, club
// revenue splits, tournament true-ups, etc. — that an admin records and later
// verifies. Sponsorship payouts are settlements with kind='sponsorship'.
type AdminSettlement struct {
	ID           string          `json:"id"`
	Kind         string          `json:"kind"`
	Reference    string          `json:"reference"`
	Counterparty string          `json:"counterparty"`
	AmountCents  int64           `json:"amount_cents"`
	Currency     string          `json:"currency"`
	Status       string          `json:"status"` // pending | verified
	Note         string          `json:"note"`
	Detail       json.RawMessage `json:"detail"`
	CreatedBy    string          `json:"created_by"`
	CreatedAt    time.Time       `json:"created_at"`
	VerifiedBy   string          `json:"verified_by"`
	VerifiedAt   *time.Time      `json:"verified_at"`
}

// CreateSettlement records a pending settlement and returns its id.
func (s *AdminStore) CreateSettlement(ctx context.Context, kind, reference, counterparty string, amountCents int64, currency, note, detailJSON, adminUserID string) (string, error) {
	if currency == "" {
		currency = "usd"
	}
	if detailJSON == "" {
		detailJSON = "{}"
	}
	id := NewID("stl")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_settlement (id, kind, reference, counterparty, amount_cents, currency, status, note, detail, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,NOW())`,
		id, kind, reference, counterparty, amountCents, currency, note, detailJSON, adminUserID)
	return id, err
}

// ListSettlements returns settlements filtered by optional kind and status
// (empty = any), newest first.
func (s *AdminStore) ListSettlements(ctx context.Context, kind, status string, limit int) ([]AdminSettlement, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, reference, counterparty, amount_cents, currency, status, note, detail, created_by, created_at, verified_by, verified_at
		FROM poker_settlement
		WHERE ($1 = '' OR kind = $1) AND ($2 = '' OR status = $2)
		ORDER BY created_at DESC LIMIT $3`, kind, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return adminScanSettlements(rows)
}

// GetSettlement returns a settlement, or (nil, nil) if missing.
func (s *AdminStore) GetSettlement(ctx context.Context, id string) (*AdminSettlement, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, kind, reference, counterparty, amount_cents, currency, status, note, detail, created_by, created_at, verified_by, verified_at
		FROM poker_settlement WHERE id=$1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items, err := adminScanSettlements(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}
	return &items[0], nil
}

// VerifySettlement marks a settlement verified.
func (s *AdminStore) VerifySettlement(ctx context.Context, id, adminUserID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_settlement SET status='verified', verified_by=$2, verified_at=NOW()
		WHERE id=$1`, id, adminUserID)
	return err
}

func adminScanSettlements(rows *sql.Rows) ([]AdminSettlement, error) {
	out := []AdminSettlement{}
	for rows.Next() {
		var st AdminSettlement
		var verifiedAt sql.NullTime
		var verifiedBy sql.NullString
		if err := rows.Scan(&st.ID, &st.Kind, &st.Reference, &st.Counterparty, &st.AmountCents,
			&st.Currency, &st.Status, &st.Note, &st.Detail, &st.CreatedBy, &st.CreatedAt,
			&verifiedBy, &verifiedAt); err != nil {
			return nil, err
		}
		if verifiedBy.Valid {
			st.VerifiedBy = verifiedBy.String
		}
		if verifiedAt.Valid {
			t := verifiedAt.Time
			st.VerifiedAt = &t
		}
		out = append(out, st)
	}
	return out, rows.Err()
}
