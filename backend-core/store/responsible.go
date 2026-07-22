package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// ResponsibleStore backs the responsible-gambling limits, account 2FA,
// email/backup recovery codes, and personal API keys. All four concerns share
// this store because they are the caller's account-security surface and are
// wired by the same set of RPCs (rpc/responsible.go, rpc/security.go,
// rpc/recovery.go).
type ResponsibleStore struct{ db *sql.DB }

func NewResponsibleStore(db *sql.DB) *ResponsibleStore { return &ResponsibleStore{db: db} }

// --- Responsible-gambling limits ---

// RgLimit is a player's self-imposed responsible-gambling configuration. Cents
// fields of 0 mean "no limit". CoolOffUntil / SelfExcludedUntil are nil when the
// player is not currently in a cool-off or self-exclusion window.
type RgLimit struct {
	UserID             string     `json:"user_id"`
	DepositDailyCents  int64      `json:"deposit_daily_cents"`
	DepositWeeklyCents int64      `json:"deposit_weekly_cents"`
	DepositMonthlyCents int64     `json:"deposit_monthly_cents"`
	LossDailyCents     int64      `json:"loss_daily_cents"`
	SessionMinutes     int64      `json:"session_minutes"`
	CoolOffUntil       *time.Time `json:"cool_off_until,omitempty"`
	SelfExcludedUntil  *time.Time `json:"self_excluded_until,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// GetLimits returns a user's RG configuration, or a zero-valued (all-unlimited)
// RgLimit if the player has never set one.
func (s *ResponsibleStore) GetLimits(ctx context.Context, userID string) (*RgLimit, error) {
	var l RgLimit
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id, deposit_daily_cents, deposit_weekly_cents, deposit_monthly_cents,
		       loss_daily_cents, session_minutes, cool_off_until, self_excluded_until, updated_at
		FROM poker_rg_limit WHERE user_id=$1`, userID).
		Scan(&l.UserID, &l.DepositDailyCents, &l.DepositWeeklyCents, &l.DepositMonthlyCents,
			&l.LossDailyCents, &l.SessionMinutes, &l.CoolOffUntil, &l.SelfExcludedUntil, &l.UpdatedAt)
	if err == sql.ErrNoRows {
		return &RgLimit{UserID: userID}, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// SetLimits upserts the deposit / loss / session limits, leaving any active
// cool-off or self-exclusion windows untouched.
func (s *ResponsibleStore) SetLimits(ctx context.Context, l *RgLimit) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rg_limit
			(user_id, deposit_daily_cents, deposit_weekly_cents, deposit_monthly_cents,
			 loss_daily_cents, session_minutes, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			deposit_daily_cents=EXCLUDED.deposit_daily_cents,
			deposit_weekly_cents=EXCLUDED.deposit_weekly_cents,
			deposit_monthly_cents=EXCLUDED.deposit_monthly_cents,
			loss_daily_cents=EXCLUDED.loss_daily_cents,
			session_minutes=EXCLUDED.session_minutes,
			updated_at=NOW()`,
		l.UserID, l.DepositDailyCents, l.DepositWeeklyCents, l.DepositMonthlyCents,
		l.LossDailyCents, l.SessionMinutes)
	return err
}

// SetCoolOff arms a temporary cool-off window (a lighter, self-lifting break).
func (s *ResponsibleStore) SetCoolOff(ctx context.Context, userID string, until time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rg_limit (user_id, cool_off_until, updated_at)
		VALUES ($1,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET cool_off_until=$2, updated_at=NOW()`,
		userID, until)
	return err
}

// SetSelfExcluded arms a self-exclusion window. A nil `until` means a permanent
// self-exclusion (stored as the far-future sentinel).
func (s *ResponsibleStore) SetSelfExcluded(ctx context.Context, userID string, until time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rg_limit (user_id, self_excluded_until, updated_at)
		VALUES ($1,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET self_excluded_until=$2, updated_at=NOW()`,
		userID, until)
	return err
}

// --- Two-factor authentication ---

// TwoFA is a user's TOTP enrolment. Enabled is false between setup and the first
// successful verify (proof the authenticator app holds the secret).
type TwoFA struct {
	UserID      string   `json:"user_id"`
	Secret      string   `json:"secret"`
	Enabled     bool     `json:"enabled"`
	BackupCodes []string `json:"backup_codes"`
}

// GetTwoFA returns a user's 2FA row, or (nil, nil) if never enrolled.
func (s *ResponsibleStore) GetTwoFA(ctx context.Context, userID string) (*TwoFA, error) {
	var t TwoFA
	var codes string
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id, totp_secret, enabled, backup_codes FROM poker_user_2fa WHERE user_id=$1`, userID).
		Scan(&t.UserID, &t.Secret, &t.Enabled, &codes)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if codes != "" {
		_ = json.Unmarshal([]byte(codes), &t.BackupCodes)
	}
	return &t, nil
}

// UpsertTwoFA stores (or replaces) a user's TOTP secret + hashed backup codes,
// resetting enabled to false until the caller verifies a code.
func (s *ResponsibleStore) UpsertTwoFA(ctx context.Context, userID, secret string, hashedBackupCodes []string) error {
	codes, _ := json.Marshal(hashedBackupCodes)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_user_2fa (user_id, totp_secret, enabled, backup_codes, created_at, updated_at)
		VALUES ($1,$2,FALSE,$3,NOW(),NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			totp_secret=EXCLUDED.totp_secret, enabled=FALSE, backup_codes=EXCLUDED.backup_codes, updated_at=NOW()`,
		userID, secret, string(codes))
	return err
}

// SetTwoFAEnabled flips the enabled flag once a code has been verified.
func (s *ResponsibleStore) SetTwoFAEnabled(ctx context.Context, userID string, enabled bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_user_2fa SET enabled=$2, updated_at=NOW() WHERE user_id=$1`, userID, enabled)
	return err
}

// DeleteTwoFA removes a user's 2FA enrolment entirely.
func (s *ResponsibleStore) DeleteTwoFA(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_user_2fa WHERE user_id=$1`, userID)
	return err
}

// ConsumeBackupCode removes a matching hashed backup code from the user's set,
// reporting whether one was consumed. Used for 2FA-recovery login.
func (s *ResponsibleStore) ConsumeBackupCode(ctx context.Context, userID, hashedCode string) (bool, error) {
	t, err := s.GetTwoFA(ctx, userID)
	if err != nil || t == nil {
		return false, err
	}
	kept := make([]string, 0, len(t.BackupCodes))
	found := false
	for _, c := range t.BackupCodes {
		if c == hashedCode {
			found = true
			continue
		}
		kept = append(kept, c)
	}
	if !found {
		return false, nil
	}
	codes, _ := json.Marshal(kept)
	_, err = s.db.ExecContext(ctx,
		`UPDATE poker_user_2fa SET backup_codes=$2, updated_at=NOW() WHERE user_id=$1`, userID, string(codes))
	return err == nil, err
}

// --- Email recovery codes ---

// CreateRecoveryCode stores a single-use, hashed email-recovery code.
func (s *ResponsibleStore) CreateRecoveryCode(ctx context.Context, userID, email, hashedCode string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_recovery_code (id, user_id, email, code_hash, expires_at, used, created_at)
		VALUES ($1,$2,$3,$4,$5,FALSE,NOW())`,
		NewID("rec"), userID, email, hashedCode, expiresAt)
	return err
}

// ConsumeRecoveryCode verifies an unused, unexpired recovery code for an email,
// marks it used, and returns the owning user id (empty if no match).
func (s *ResponsibleStore) ConsumeRecoveryCode(ctx context.Context, email, hashedCode string) (string, error) {
	var id, userID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id FROM poker_recovery_code
		WHERE email=$1 AND code_hash=$2 AND NOT used AND expires_at > NOW()
		ORDER BY created_at DESC LIMIT 1`, email, hashedCode).Scan(&id, &userID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE poker_recovery_code SET used=TRUE WHERE id=$1`, id); err != nil {
		return "", err
	}
	return userID, nil
}

// ResolveUserByEmail maps an account email to its Nakama user id (empty if none).
// Reads Nakama's own `users` table so recovery flows can start from an email
// alone (there is no runtime "get account by email").
func (s *ResponsibleStore) ResolveUserByEmail(ctx context.Context, email string) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email=$1`, email).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return id, nil
}

// --- Personal API keys ---

// ApiKey is a personal API key record (the raw secret is never stored — only its
// SHA-256 hash and a short display prefix).
type ApiKey struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Label      string     `json:"label"`
	Prefix     string     `json:"prefix"`
	Revoked    bool       `json:"revoked"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

// CreateApiKey stores a new key's hash + display prefix and returns its id.
func (s *ResponsibleStore) CreateApiKey(ctx context.Context, userID, label, prefix, keyHash string) (string, error) {
	id := NewID("apik")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_api_key (id, user_id, label, prefix, key_hash, revoked, created_at)
		VALUES ($1,$2,$3,$4,$5,FALSE,NOW())`,
		id, userID, label, prefix, keyHash)
	return id, err
}

// ListApiKeys returns a user's keys (newest first), never exposing the hash.
func (s *ResponsibleStore) ListApiKeys(ctx context.Context, userID string) ([]ApiKey, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, label, prefix, revoked, created_at, last_used_at
		FROM poker_api_key WHERE user_id=$1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ApiKey{}
	for rows.Next() {
		var k ApiKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Label, &k.Prefix, &k.Revoked, &k.CreatedAt, &k.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// RevokeApiKey marks a caller-owned key revoked, reporting whether a row matched.
func (s *ResponsibleStore) RevokeApiKey(ctx context.Context, userID, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE poker_api_key SET revoked=TRUE WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
