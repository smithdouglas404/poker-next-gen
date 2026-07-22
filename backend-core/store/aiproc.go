package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// AiprocStore persists the AI / trust-and-safety / support / marketing surfaces:
// anti-bot scores (poker_antibot_score), collusion review flags
// (poker_collusion_flag), platform announcements (poker_announcement), support
// tickets (poker_support_ticket) and device fingerprints for multi-account
// detection (poker_device_fingerprint). It follows the same thin-wrapper pattern
// as ClubStore / CosmeticStore — QueryContext/ExecContext, (nil,nil) on
// sql.ErrNoRows.
type AiprocStore struct{ db *sql.DB }

// NewAiprocStore wraps a DB handle for the aiproc domain.
func NewAiprocStore(db *sql.DB) *AiprocStore { return &AiprocStore{db: db} }

// --- Anti-bot scores ---

// AiprocAntibotScore is one persisted bot-likelihood evaluation for a user
// (one upserted row per user).
type AiprocAntibotScore struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	Score        float64         `json:"score"`
	Risk         string          `json:"risk"`
	Flags        json.RawMessage `json:"flags"`
	SampleSize   int             `json:"sample_size"`
	Banned       bool            `json:"banned"`
	BannedReason string          `json:"banned_reason,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// UpsertAntibotScore records (or refreshes) a user's bot-likelihood score.
func (s *AiprocStore) UpsertAntibotScore(ctx context.Context, userID string, score float64, risk string, flags []string, sampleSize int) error {
	if flags == nil {
		flags = []string{}
	}
	flagsJSON, _ := json.Marshal(flags)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_antibot_score (id, user_id, score, risk, flags_json, sample_size, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			score=EXCLUDED.score,
			risk=EXCLUDED.risk,
			flags_json=EXCLUDED.flags_json,
			sample_size=EXCLUDED.sample_size,
			updated_at=NOW()`,
		NewID("bot"), userID, score, risk, flagsJSON, sampleSize)
	return err
}

// ListAntibotScores returns persisted scores, highest-risk first. When
// flaggedOnly is set, only rows above the "low" risk band are returned.
func (s *AiprocStore) ListAntibotScores(ctx context.Context, flaggedOnly bool, limit int) ([]AiprocAntibotScore, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := `SELECT id, user_id, score, risk, flags_json, sample_size, banned, banned_reason, created_at, updated_at
	      FROM poker_antibot_score`
	if flaggedOnly {
		q += ` WHERE risk <> 'low'`
	}
	q += ` ORDER BY score DESC, updated_at DESC LIMIT $1`
	rows, err := s.db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return aiprocScanScores(rows)
}

// BanAntibotUser marks a user as banned for bot activity, creating a score row
// if none exists yet.
func (s *AiprocStore) BanAntibotUser(ctx context.Context, userID, reason string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_antibot_score (id, user_id, score, risk, banned, banned_reason, created_at, updated_at)
		VALUES ($1,$2,1,'high',TRUE,$3,NOW(),NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			banned=TRUE,
			banned_reason=EXCLUDED.banned_reason,
			updated_at=NOW()`,
		NewID("bot"), userID, reason)
	return err
}

func aiprocScanScores(rows *sql.Rows) ([]AiprocAntibotScore, error) {
	out := []AiprocAntibotScore{}
	for rows.Next() {
		var r AiprocAntibotScore
		if err := rows.Scan(&r.ID, &r.UserID, &r.Score, &r.Risk, &r.Flags, &r.SampleSize, &r.Banned, &r.BannedReason, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- Collusion flags ---

// AiprocCollusionFlag is a suspected-collusion pair queued for admin review.
type AiprocCollusionFlag struct {
	ID         string       `json:"id"`
	UserA      string       `json:"user_a"`
	UserB      string       `json:"user_b"`
	MatchID    string       `json:"match_id,omitempty"`
	Reason     string       `json:"reason"`
	Score      float64      `json:"score"`
	Status     string       `json:"status"`
	ReviewedBy string       `json:"reviewed_by,omitempty"`
	ReviewNote string       `json:"review_note,omitempty"`
	CreatedAt  time.Time    `json:"created_at"`
	ReviewedAt sql.NullTime `json:"-"`
}

// FlagCollusion records a suspected-collusion pair (status "open"). Intended for
// the match-loop / detection writers; the admin RPCs only list and review.
func (s *AiprocStore) FlagCollusion(ctx context.Context, userA, userB, matchID, reason string, score float64) (string, error) {
	id := NewID("col")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_collusion_flag (id, user_a, user_b, match_id, reason, score, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,'open',NOW())`,
		id, userA, userB, matchID, reason, score)
	return id, err
}

// ListCollusion returns flags, newest first, optionally filtered by status.
func (s *AiprocStore) ListCollusion(ctx context.Context, status string, limit int) ([]AiprocCollusionFlag, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := `SELECT id, user_a, user_b, match_id, reason, score, status, reviewed_by, review_note, created_at, reviewed_at
	      FROM poker_collusion_flag`
	args := []interface{}{}
	if status != "" {
		q += ` WHERE status=$1`
		args = append(args, status)
		q += ` ORDER BY created_at DESC LIMIT $2`
	} else {
		q += ` ORDER BY created_at DESC LIMIT $1`
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AiprocCollusionFlag{}
	for rows.Next() {
		var f AiprocCollusionFlag
		if err := rows.Scan(&f.ID, &f.UserA, &f.UserB, &f.MatchID, &f.Reason, &f.Score, &f.Status, &f.ReviewedBy, &f.ReviewNote, &f.CreatedAt, &f.ReviewedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// ReviewCollusion resolves a flag with a status ("confirmed"|"dismissed") and an
// optional note, stamping the reviewer and time.
func (s *AiprocStore) ReviewCollusion(ctx context.Context, id, reviewedBy, status, note string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_collusion_flag
		SET status=$2, reviewed_by=$3, review_note=$4, reviewed_at=NOW()
		WHERE id=$1`,
		id, status, reviewedBy, note)
	return err
}

// --- Announcements ---

// AiprocAnnouncement is a platform MOTD / breaking-news banner.
type AiprocAnnouncement struct {
	ID        string       `json:"id"`
	Title     string       `json:"title"`
	Body      string       `json:"body"`
	Severity  string       `json:"severity"`
	Audience  string       `json:"audience"`
	StartsAt  time.Time    `json:"starts_at"`
	EndsAt    sql.NullTime `json:"-"`
	CreatedBy string       `json:"created_by,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
}

// CreateAnnouncement inserts a MOTD and returns its id.
func (s *AiprocStore) CreateAnnouncement(ctx context.Context, a *AiprocAnnouncement) (string, error) {
	if a.ID == "" {
		a.ID = NewID("ann")
	}
	if a.Severity == "" {
		a.Severity = "info"
	}
	if a.Audience == "" {
		a.Audience = "all"
	}
	var endsAt interface{}
	if a.EndsAt.Valid {
		endsAt = a.EndsAt.Time
	}
	starts := a.StartsAt
	if starts.IsZero() {
		starts = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_announcement (id, title, body, severity, audience, starts_at, ends_at, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
		a.ID, a.Title, a.Body, a.Severity, a.Audience, starts, endsAt, a.CreatedBy)
	return a.ID, err
}

// DeleteAnnouncement removes a MOTD by id.
func (s *AiprocStore) DeleteAnnouncement(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_announcement WHERE id=$1`, id)
	return err
}

// ListAnnouncements returns the currently-active announcements visible to the
// given audience ("all" always included), newest-effective first. Passing
// includeAll shows every row regardless of window (admin management view).
func (s *AiprocStore) ListAnnouncements(ctx context.Context, audience string, includeAll bool) ([]AiprocAnnouncement, error) {
	q := `SELECT id, title, body, severity, audience, starts_at, ends_at, created_by, created_at
	      FROM poker_announcement`
	args := []interface{}{}
	if !includeAll {
		q += ` WHERE starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())`
		if audience != "" {
			q += ` AND (audience='all' OR audience=$1)`
			args = append(args, audience)
		}
	}
	q += ` ORDER BY starts_at DESC, created_at DESC LIMIT 100`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AiprocAnnouncement{}
	for rows.Next() {
		var a AiprocAnnouncement
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.Severity, &a.Audience, &a.StartsAt, &a.EndsAt, &a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// --- Support tickets ---

// AiprocTicketMessage is one entry in a support ticket's conversation thread.
type AiprocTicketMessage struct {
	Author string    `json:"author"`
	Role   string    `json:"role"` // "user" | "admin"
	Body   string    `json:"body"`
	At     time.Time `json:"at"`
}

// AiprocSupportTicket is a support/contact request with its message thread.
type AiprocSupportTicket struct {
	ID        string                `json:"id"`
	UserID    string                `json:"user_id,omitempty"`
	Email     string                `json:"email,omitempty"`
	Subject   string                `json:"subject"`
	Category  string                `json:"category"`
	Priority  string                `json:"priority"`
	Status    string                `json:"status"`
	Messages  []AiprocTicketMessage `json:"messages"`
	CreatedAt time.Time             `json:"created_at"`
	UpdatedAt time.Time             `json:"updated_at"`
}

// CreateTicket opens a support ticket seeded with its first message.
func (s *AiprocStore) CreateTicket(ctx context.Context, t *AiprocSupportTicket) (string, error) {
	if t.ID == "" {
		t.ID = NewID("tkt")
	}
	if t.Category == "" {
		t.Category = "general"
	}
	if t.Priority == "" {
		t.Priority = "normal"
	}
	if t.Status == "" {
		t.Status = "open"
	}
	if t.Messages == nil {
		t.Messages = []AiprocTicketMessage{}
	}
	msgs, _ := json.Marshal(t.Messages)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_support_ticket (id, user_id, email, subject, category, priority, status, messages_json, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
		t.ID, t.UserID, t.Email, t.Subject, t.Category, t.Priority, t.Status, msgs)
	return t.ID, err
}

// GetTicket returns a ticket by id, or (nil, nil) if missing.
func (s *AiprocStore) GetTicket(ctx context.Context, id string) (*AiprocSupportTicket, error) {
	var t AiprocSupportTicket
	var msgs []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, email, subject, category, priority, status, messages_json, created_at, updated_at
		FROM poker_support_ticket WHERE id=$1`, id).
		Scan(&t.ID, &t.UserID, &t.Email, &t.Subject, &t.Category, &t.Priority, &t.Status, &msgs, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Messages = aiprocDecodeMessages(msgs)
	return &t, nil
}

// ListTickets returns a user's tickets, newest first.
func (s *AiprocStore) ListTickets(ctx context.Context, userID string, limit int) ([]AiprocSupportTicket, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, email, subject, category, priority, status, messages_json, created_at, updated_at
		FROM poker_support_ticket WHERE user_id=$1
		ORDER BY updated_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return aiprocScanTickets(rows)
}

// ListAllTickets returns every ticket (admin), optionally filtered by status.
func (s *AiprocStore) ListAllTickets(ctx context.Context, status string, limit int) ([]AiprocSupportTicket, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `SELECT id, user_id, email, subject, category, priority, status, messages_json, created_at, updated_at
	      FROM poker_support_ticket`
	args := []interface{}{}
	if status != "" {
		q += ` WHERE status=$1`
		args = append(args, status)
		q += ` ORDER BY updated_at DESC LIMIT $2`
	} else {
		q += ` ORDER BY updated_at DESC LIMIT $1`
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return aiprocScanTickets(rows)
}

// AddTicketMessage appends a message to a ticket's thread and optionally updates
// its status (pass "" to leave the status unchanged).
func (s *AiprocStore) AddTicketMessage(ctx context.Context, id string, msg AiprocTicketMessage, newStatus string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var raw []byte
	var status string
	if err := tx.QueryRowContext(ctx,
		`SELECT messages_json, status FROM poker_support_ticket WHERE id=$1 FOR UPDATE`, id).
		Scan(&raw, &status); err != nil {
		return err
	}
	if msg.At.IsZero() {
		msg.At = time.Now().UTC()
	}
	msgs := append(aiprocDecodeMessages(raw), msg)
	encoded, _ := json.Marshal(msgs)
	if newStatus != "" {
		status = newStatus
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE poker_support_ticket SET messages_json=$2, status=$3, updated_at=NOW() WHERE id=$1`,
		id, encoded, status); err != nil {
		return err
	}
	return tx.Commit()
}

func aiprocScanTickets(rows *sql.Rows) ([]AiprocSupportTicket, error) {
	out := []AiprocSupportTicket{}
	for rows.Next() {
		var t AiprocSupportTicket
		var msgs []byte
		if err := rows.Scan(&t.ID, &t.UserID, &t.Email, &t.Subject, &t.Category, &t.Priority, &t.Status, &msgs, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Messages = aiprocDecodeMessages(msgs)
		out = append(out, t)
	}
	return out, rows.Err()
}

func aiprocDecodeMessages(raw []byte) []AiprocTicketMessage {
	msgs := []AiprocTicketMessage{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &msgs)
	}
	return msgs
}

// --- Device fingerprints (multi-account detection) ---

// AiprocDeviceRow is a (user, device-fingerprint) association.
type AiprocDeviceRow struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Fingerprint string    `json:"fingerprint"`
	IP          string    `json:"ip,omitempty"`
	UserAgent   string    `json:"user_agent,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	LastSeenAt  time.Time `json:"last_seen_at"`
}

// RegisterDevice records (or refreshes) a device fingerprint for a user.
func (s *AiprocStore) RegisterDevice(ctx context.Context, userID, fingerprint, ip, userAgent string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_device_fingerprint (id, user_id, fingerprint, ip, user_agent, created_at, last_seen_at)
		VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
		ON CONFLICT (user_id, fingerprint) DO UPDATE SET
			ip=EXCLUDED.ip,
			user_agent=EXCLUDED.user_agent,
			last_seen_at=NOW()`,
		NewID("dev"), userID, fingerprint, ip, userAgent)
	return err
}

// AiprocMultiAccount is a fingerprint shared by two or more distinct accounts.
type AiprocMultiAccount struct {
	Fingerprint string    `json:"fingerprint"`
	UserIDs     []string  `json:"user_ids"`
	AccountN    int       `json:"account_count"`
	LastSeenAt  time.Time `json:"last_seen_at"`
}

// MultiAccountFingerprints returns fingerprints associated with more than one
// user — the multi-account / shared-device signal for the admin review surface.
func (s *AiprocStore) MultiAccountFingerprints(ctx context.Context, limit int) ([]AiprocMultiAccount, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT fingerprint,
		       ARRAY_AGG(DISTINCT user_id),
		       COUNT(DISTINCT user_id),
		       MAX(last_seen_at)
		FROM poker_device_fingerprint
		GROUP BY fingerprint
		HAVING COUNT(DISTINCT user_id) > 1
		ORDER BY COUNT(DISTINCT user_id) DESC, MAX(last_seen_at) DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AiprocMultiAccount{}
	for rows.Next() {
		var m AiprocMultiAccount
		var ids aiprocStringArray
		if err := rows.Scan(&m.Fingerprint, &ids, &m.AccountN, &m.LastSeenAt); err != nil {
			return nil, err
		}
		m.UserIDs = []string(ids)
		out = append(out, m)
	}
	return out, rows.Err()
}

// aiprocStringArray scans a Postgres TEXT[] into a Go []string without pulling
// in the lib/pq array helper (keeping this store dependency-free like its
// siblings).
type aiprocStringArray []string

func (a *aiprocStringArray) Scan(src interface{}) error {
	*a = nil
	var s string
	switch v := src.(type) {
	case nil:
		return nil
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return nil
	}
	// Postgres array literal: {a,b,c} — good enough for opaque user ids, which
	// never contain commas or braces.
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return nil
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return nil
	}
	cur := ""
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == ',' {
			*a = append(*a, aiprocUnquote(cur))
			cur = ""
			continue
		}
		cur += string(c)
	}
	*a = append(*a, aiprocUnquote(cur))
	return nil
}

func aiprocUnquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

// --- Global stats + rakeback batch ---

// AiprocGlobalStats is the public network-wide snapshot behind stats_global.
type AiprocGlobalStats struct {
	Hands      int64 `json:"hands"`
	Players    int64 `json:"players"`
	Clubs      int64 `json:"clubs"`
	PotCents   int64 `json:"pot_cents"`
	RakeCents  int64 `json:"rake_cents"`
	OpenTables int64 `json:"open_tables"`
}

// GlobalStats rolls up public counters. Each sub-count is best-effort: a missing
// or empty source contributes zero rather than failing the whole read.
func (s *AiprocStore) GlobalStats(ctx context.Context) (*AiprocGlobalStats, error) {
	g := &AiprocGlobalStats{}
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(pot),0), COALESCE(SUM(rake),0) FROM poker_hand_index`).
		Scan(&g.Hands, &g.PotCents, &g.RakeCents)
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT user_id) FROM poker_hand_stats`).Scan(&g.Players)
	_ = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_club WHERE is_active`).Scan(&g.Clubs)
	return g, nil
}

// PendingRakebackUsers returns the ids of users with a positive claimable
// rakeback balance — the batch that rakeback_process_all sweeps to wallets.
func (s *AiprocStore) PendingRakebackUsers(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT user_id FROM poker_rakeback WHERE balance > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
