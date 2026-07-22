package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// ClubExtStore backs the clubs-expansion domain: extended club metadata
// (visibility/branding/settings), invitations & join-requests, per-club stat
// rollups, announcements, scheduled events, chat, and an activity feed. It is a
// thin wrapper over *sql.DB and returns (nil, nil) on sql.ErrNoRows, matching
// the house store pattern (see store/club.go, store/cosmetics.go).
type ClubExtStore struct{ db *sql.DB }

func NewClubExtStore(db *sql.DB) *ClubExtStore { return &ClubExtStore{db: db} }

// ClubExt is a club row including the columns added by the clubs-expansion
// ALTER (is_public, require_approval, tag, avatar_ref, banner_ref,
// settings_json). MemberCount is a derived aggregate, not a stored column.
type ClubExt struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Slug            string          `json:"slug"`
	Description     string          `json:"description"`
	Currency        string          `json:"currency"`
	IsActive        bool            `json:"is_active"`
	IsPublic        bool            `json:"is_public"`
	RequireApproval bool            `json:"require_approval"`
	Tag             string          `json:"tag"`
	AvatarRef       string          `json:"avatar_ref"`
	BannerRef       string          `json:"banner_ref"`
	SettingsJSON    json.RawMessage `json:"settings_json"`
	MemberCount     int             `json:"member_count"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

const clubsextSelectCols = `id, name, slug, description, currency, is_active,
	COALESCE(is_public,FALSE), COALESCE(require_approval,FALSE),
	COALESCE(tag,''), COALESCE(avatar_ref,''), COALESCE(banner_ref,''),
	COALESCE(settings_json,'{}'::jsonb), created_at, updated_at`

func clubsextScan(row interface {
	Scan(dest ...interface{}) error
}) (*ClubExt, error) {
	var c ClubExt
	var settings []byte
	if err := row.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.IsActive,
		&c.IsPublic, &c.RequireApproval, &c.Tag, &c.AvatarRef, &c.BannerRef,
		&settings, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	if len(settings) == 0 {
		settings = []byte("{}")
	}
	c.SettingsJSON = json.RawMessage(settings)
	return &c, nil
}

// GetExt returns a club with its extended columns, or (nil, nil) if missing.
func (s *ClubExtStore) GetExt(ctx context.Context, id string) (*ClubExt, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+clubsextSelectCols+` FROM poker_club WHERE id=$1`, id)
	c, err := clubsextScan(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.MemberCount, _ = s.memberCount(ctx, c.ID)
	return c, nil
}

func (s *ClubExtStore) memberCount(ctx context.Context, clubID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM poker_club_member WHERE club_id=$1`, clubID).Scan(&n)
	return n, err
}

// ClubExtPatch carries the mutable subset of a club's settings for club_update.
// Nil fields are left unchanged.
type ClubExtPatch struct {
	Name            *string
	Description     *string
	Tag             *string
	IsPublic        *bool
	RequireApproval *bool
	AvatarRef       *string
	BannerRef       *string
	SettingsJSON    json.RawMessage
}

// UpdateExt patches the provided club columns and bumps updated_at.
func (s *ClubExtStore) UpdateExt(ctx context.Context, id string, p ClubExtPatch) error {
	sets := []string{"updated_at=NOW()"}
	args := []interface{}{id}
	add := func(expr string, v interface{}) {
		args = append(args, v)
		sets = append(sets, expr+"=$"+itoaClubsext(len(args)))
	}
	if p.Name != nil {
		add("name", *p.Name)
	}
	if p.Description != nil {
		add("description", *p.Description)
	}
	if p.Tag != nil {
		add("tag", *p.Tag)
	}
	if p.IsPublic != nil {
		add("is_public", *p.IsPublic)
	}
	if p.RequireApproval != nil {
		add("require_approval", *p.RequireApproval)
	}
	if p.AvatarRef != nil {
		add("avatar_ref", *p.AvatarRef)
	}
	if p.BannerRef != nil {
		add("banner_ref", *p.BannerRef)
	}
	if len(p.SettingsJSON) > 0 {
		add("settings_json", string(p.SettingsJSON))
	}
	q := "UPDATE poker_club SET " + joinClubsext(sets, ", ") + " WHERE id=$1"
	_, err := s.db.ExecContext(ctx, q, args...)
	return err
}

// Deactivate soft-deletes a club by clearing is_active (the roster/ledger rows
// are preserved). club_delete uses this rather than a hard DELETE.
func (s *ClubExtStore) Deactivate(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club SET is_active=FALSE, updated_at=NOW() WHERE id=$1`, id)
	return err
}

// Browse returns public, active clubs for discovery, filtered by optional tag
// and case-insensitive name search, with derived member counts.
func (s *ClubExtStore) Browse(ctx context.Context, tag, search string, limit, offset int) ([]ClubExt, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	q := `SELECT ` + clubsextSelectCols + `,
		(SELECT COUNT(*) FROM poker_club_member m WHERE m.club_id=poker_club.id) AS member_count
		FROM poker_club WHERE is_active AND COALESCE(is_public,FALSE)`
	args := []interface{}{}
	if tag != "" {
		args = append(args, tag)
		q += ` AND tag=$` + itoaClubsext(len(args))
	}
	if search != "" {
		args = append(args, "%"+search+"%")
		q += ` AND name ILIKE $` + itoaClubsext(len(args))
	}
	args = append(args, limit)
	q += ` ORDER BY member_count DESC, created_at DESC LIMIT $` + itoaClubsext(len(args))
	args = append(args, offset)
	q += ` OFFSET $` + itoaClubsext(len(args))
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubExt{}
	for rows.Next() {
		var c ClubExt
		var settings []byte
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.IsActive,
			&c.IsPublic, &c.RequireApproval, &c.Tag, &c.AvatarRef, &c.BannerRef,
			&settings, &c.CreatedAt, &c.UpdatedAt, &c.MemberCount); err != nil {
			return nil, err
		}
		if len(settings) == 0 {
			settings = []byte("{}")
		}
		c.SettingsJSON = json.RawMessage(settings)
		out = append(out, c)
	}
	return out, rows.Err()
}

// TransferOwnership hands the primary ownership of a club to another user. The
// new owner gets role='owner' + can_configure (full equity); the previous owner
// is demoted to a configuring 'manager'. Both the poker_owner and
// poker_club_member role rows are kept consistent inside one transaction.
func (s *ClubExtStore) TransferOwnership(ctx context.Context, clubID, fromUser, toUser, toUsername string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	// Promote the new owner (upsert an owner row with full config rights).
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_owner (id, club_id, user_id, role, equity_bps, can_configure, created_at, updated_at)
		VALUES ($1,$2,$3,'owner',10000,TRUE,$4,$4)
		ON CONFLICT (club_id, user_id) DO UPDATE SET role='owner', equity_bps=10000, can_configure=TRUE, updated_at=$4`,
		NewID("owner"), clubID, toUser, now); err != nil {
		return err
	}
	// Demote the previous owner to a configuring manager.
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_owner SET role='manager', equity_bps=0, updated_at=$3
		WHERE club_id=$1 AND user_id=$2`, clubID, fromUser, now); err != nil {
		return err
	}
	// Reflect the change in the member roster.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_club_member (club_id, user_id, username, role, status, joined_at)
		VALUES ($1,$2,$3,'owner','active',NOW())
		ON CONFLICT (club_id, user_id) DO UPDATE SET role='owner', status='active'`,
		clubID, toUser, toUsername); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_club_member SET role='admin' WHERE club_id=$1 AND user_id=$2`, clubID, fromUser); err != nil {
		return err
	}
	return tx.Commit()
}

// --- Invitations & join requests ---

// ClubInvitation is a pending invite (club → user) or join-request (user →
// club). Type is "invite" or "request".
type ClubInvitation struct {
	ID              string    `json:"id"`
	ClubID          string    `json:"club_id"`
	UserID          string    `json:"user_id"`
	Username        string    `json:"username"`
	Inviter         string    `json:"inviter"`
	Type            string    `json:"type"`
	Role            string    `json:"role"`
	CreditLimitCents int64    `json:"credit_limit_cents"`
	Status          string    `json:"status"`
	Message         string    `json:"message"`
	CreatedAt       time.Time `json:"created_at"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy      string    `json:"reviewed_by,omitempty"`
}

// CreateInvitation inserts an invite/request row and returns its id.
func (s *ClubExtStore) CreateInvitation(ctx context.Context, inv *ClubInvitation) (string, error) {
	if inv.ID == "" {
		inv.ID = NewID("clinv")
	}
	if inv.Status == "" {
		inv.Status = "pending"
	}
	if inv.Role == "" {
		inv.Role = "member"
	}
	inv.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_invitation
			(id, club_id, user_id, username, inviter, type, role, credit_limit_cents, status, message, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		inv.ID, inv.ClubID, inv.UserID, inv.Username, inv.Inviter, inv.Type, inv.Role,
		inv.CreditLimitCents, inv.Status, inv.Message, inv.CreatedAt)
	return inv.ID, err
}

// GetInvitation returns an invitation by id, or (nil, nil) if missing.
func (s *ClubExtStore) GetInvitation(ctx context.Context, id string) (*ClubInvitation, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, user_id, username, inviter, type, role, credit_limit_cents, status, message, created_at, reviewed_at, reviewed_by
		FROM poker_club_invitation WHERE id=$1`, id)
	inv, err := clubsextScanInvitation(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// ListInvitationsForClub lists a club's invitations of a given type/status
// (empty status returns all).
func (s *ClubExtStore) ListInvitationsForClub(ctx context.Context, clubID, invType, status string) ([]ClubInvitation, error) {
	q := `SELECT id, club_id, user_id, username, inviter, type, role, credit_limit_cents, status, message, created_at, reviewed_at, reviewed_by
		FROM poker_club_invitation WHERE club_id=$1 AND type=$2`
	args := []interface{}{clubID, invType}
	if status != "" {
		args = append(args, status)
		q += ` AND status=$3`
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	return s.queryInvitations(ctx, q, args...)
}

// ListInvitationsForUser lists a user's invitations of a given type/status.
func (s *ClubExtStore) ListInvitationsForUser(ctx context.Context, userID, invType, status string) ([]ClubInvitation, error) {
	q := `SELECT id, club_id, user_id, username, inviter, type, role, credit_limit_cents, status, message, created_at, reviewed_at, reviewed_by
		FROM poker_club_invitation WHERE user_id=$1 AND type=$2`
	args := []interface{}{userID, invType}
	if status != "" {
		args = append(args, status)
		q += ` AND status=$3`
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	return s.queryInvitations(ctx, q, args...)
}

func (s *ClubExtStore) queryInvitations(ctx context.Context, q string, args ...interface{}) ([]ClubInvitation, error) {
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubInvitation{}
	for rows.Next() {
		inv, err := clubsextScanInvitation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inv)
	}
	return out, rows.Err()
}

func clubsextScanInvitation(row interface {
	Scan(dest ...interface{}) error
}) (*ClubInvitation, error) {
	var inv ClubInvitation
	var reviewedAt sql.NullTime
	var reviewedBy sql.NullString
	if err := row.Scan(&inv.ID, &inv.ClubID, &inv.UserID, &inv.Username, &inv.Inviter, &inv.Type,
		&inv.Role, &inv.CreditLimitCents, &inv.Status, &inv.Message, &inv.CreatedAt,
		&reviewedAt, &reviewedBy); err != nil {
		return nil, err
	}
	if reviewedAt.Valid {
		t := reviewedAt.Time
		inv.ReviewedAt = &t
	}
	if reviewedBy.Valid {
		inv.ReviewedBy = reviewedBy.String
	}
	return &inv, nil
}

// SetInvitationStatus resolves an invitation (accepted|declined|approved|denied)
// and records who reviewed it.
func (s *ClubExtStore) SetInvitationStatus(ctx context.Context, id, status, reviewedBy string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_club_invitation SET status=$2, reviewed_at=NOW(), reviewed_by=$3 WHERE id=$1`,
		id, status, reviewedBy)
	return err
}

// --- Stat rollups ---

// ClubStats is a per-club rollup row that backs rankings and the dashboard.
type ClubStats struct {
	ClubID      string    `json:"club_id"`
	MemberCount int       `json:"member_count"`
	Active7d    int       `json:"active_7d"`
	Hands       int64     `json:"hands"`
	WinRateBps  int       `json:"win_rate_bps"`
	ChipsWon    int64     `json:"chips_won"`
	TourneyWins int       `json:"tourney_wins"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// GetClubStats returns a club's rollup row, or a zeroed row (never nil) so
// callers can always render a stat block.
func (s *ClubExtStore) GetClubStats(ctx context.Context, clubID string) (*ClubStats, error) {
	var st ClubStats
	err := s.db.QueryRowContext(ctx, `
		SELECT club_id, member_count, active_7d, hands, win_rate_bps, chips_won, tourney_wins, updated_at
		FROM poker_club_stats WHERE club_id=$1`, clubID).
		Scan(&st.ClubID, &st.MemberCount, &st.Active7d, &st.Hands, &st.WinRateBps, &st.ChipsWon, &st.TourneyWins, &st.UpdatedAt)
	if err == sql.ErrNoRows {
		return &ClubStats{ClubID: clubID}, nil
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// UpsertClubStats writes a club's rollup (used by the match-loop attribution
// hook; exposed here so the rollup has a single writer).
func (s *ClubExtStore) UpsertClubStats(ctx context.Context, st *ClubStats) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_stats (club_id, member_count, active_7d, hands, win_rate_bps, chips_won, tourney_wins, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
		ON CONFLICT (club_id) DO UPDATE SET
			member_count=$2, active_7d=$3, hands=$4, win_rate_bps=$5, chips_won=$6, tourney_wins=$7, updated_at=NOW()`,
		st.ClubID, st.MemberCount, st.Active7d, st.Hands, st.WinRateBps, st.ChipsWon, st.TourneyWins)
	return err
}

// Rankings returns club rollups ranked by the given metric (chips_won | hands |
// win_rate | tourney_wins | members), defaulting to chips_won.
func (s *ClubExtStore) Rankings(ctx context.Context, metric string, limit int) ([]ClubStats, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	order := "chips_won DESC"
	switch metric {
	case "hands":
		order = "hands DESC"
	case "win_rate":
		order = "win_rate_bps DESC"
	case "tourney_wins":
		order = "tourney_wins DESC"
	case "members":
		order = "member_count DESC"
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT club_id, member_count, active_7d, hands, win_rate_bps, chips_won, tourney_wins, updated_at
		FROM poker_club_stats ORDER BY `+order+` LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubStats{}
	for rows.Next() {
		var st ClubStats
		if err := rows.Scan(&st.ClubID, &st.MemberCount, &st.Active7d, &st.Hands, &st.WinRateBps, &st.ChipsWon, &st.TourneyWins, &st.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// --- Rake revenue report ---

// RakeReport aggregates the club's rake ledger over a bounded window into a
// total, a hand/entry count, and a per-day series. `interval` is a fixed
// Postgres interval literal chosen by the caller (never user-supplied), so it
// is safe to inline; empty means all-time.
func (s *ClubExtStore) RakeReport(ctx context.Context, clubID, interval string) (map[string]interface{}, error) {
	where := "club_id=$1"
	if interval != "" {
		where += " AND created_at >= NOW() - INTERVAL '" + interval + "'"
	}
	var total sql.NullInt64
	var count int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount),0), COUNT(*) FROM poker_rake_ledger WHERE `+where, clubID).
		Scan(&total, &count); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(amount),0) AS amount, COUNT(*) AS hands
		FROM poker_rake_ledger WHERE `+where+`
		GROUP BY day ORDER BY day DESC LIMIT 90`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	series := []map[string]interface{}{}
	for rows.Next() {
		var day string
		var amount, hands int64
		if err := rows.Scan(&day, &amount, &hands); err != nil {
			return nil, err
		}
		series = append(series, map[string]interface{}{"day": day, "amount": amount, "hands": hands})
	}
	return map[string]interface{}{
		"total_rake": total.Int64,
		"hand_count": count,
		"series":     series,
	}, rows.Err()
}

// --- Roster & member analytics ---

// ClubRosterRow is an enriched member line: membership + allocated balance +
// activity count, for the roster and member-analytics screens.
type ClubRosterRow struct {
	UserID        string    `json:"user_id"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	Status        string    `json:"status"`
	JoinedAt      time.Time `json:"joined_at"`
	Balance       int64     `json:"balance"`
	LockedAmount  int64     `json:"locked_amount"`
	CanConfigure  bool      `json:"can_configure"`
	ActivityCount int       `json:"activity_count"`
}

// Roster returns a club's members joined to their allocated balance,
// configuring-owner flag, and recent-activity count.
func (s *ClubExtStore) Roster(ctx context.Context, clubID string) ([]ClubRosterRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.user_id, m.username, m.role, m.status, m.joined_at,
		       COALESCE(b.balance,0), COALESCE(b.locked_amount,0),
		       COALESCE(o.can_configure OR o.role='owner', FALSE),
		       COALESCE(a.cnt, 0)
		FROM poker_club_member m
		LEFT JOIN poker_player_balance b ON b.club_id=m.club_id AND b.user_id=m.user_id
		LEFT JOIN poker_owner o ON o.club_id=m.club_id AND o.user_id=m.user_id
		LEFT JOIN (
			SELECT user_id, COUNT(*) AS cnt FROM poker_club_activity
			WHERE club_id=$1 GROUP BY user_id
		) a ON a.user_id=m.user_id
		WHERE m.club_id=$1
		ORDER BY m.joined_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubRosterRow{}
	for rows.Next() {
		var r ClubRosterRow
		if err := rows.Scan(&r.UserID, &r.Username, &r.Role, &r.Status, &r.JoinedAt,
			&r.Balance, &r.LockedAmount, &r.CanConfigure, &r.ActivityCount); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- Announcements ---

// ClubAnnouncement is a posted club notice.
type ClubAnnouncement struct {
	ID        string    `json:"id"`
	ClubID    string    `json:"club_id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Severity  string    `json:"severity"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateAnnouncement inserts a club announcement and returns its id.
func (s *ClubExtStore) CreateAnnouncement(ctx context.Context, a *ClubAnnouncement) (string, error) {
	if a.ID == "" {
		a.ID = NewID("clann")
	}
	if a.Severity == "" {
		a.Severity = "info"
	}
	a.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_announcement (id, club_id, title, body, severity, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		a.ID, a.ClubID, a.Title, a.Body, a.Severity, a.CreatedBy, a.CreatedAt)
	return a.ID, err
}

// ListAnnouncements returns a club's announcements, newest first.
func (s *ClubExtStore) ListAnnouncements(ctx context.Context, clubID string, limit int) ([]ClubAnnouncement, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, title, body, severity, created_by, created_at
		FROM poker_club_announcement WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubAnnouncement{}
	for rows.Next() {
		var a ClubAnnouncement
		if err := rows.Scan(&a.ID, &a.ClubID, &a.Title, &a.Body, &a.Severity, &a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// --- Events ---

// ClubEvent is a scheduled club game/session.
type ClubEvent struct {
	ID          string    `json:"id"`
	ClubID      string    `json:"club_id"`
	Name        string    `json:"name"`
	ScheduledAt time.Time `json:"scheduled_at"`
	SmallBlind  int64     `json:"small_blind"`
	BigBlind    int64     `json:"big_blind"`
	Variant     string    `json:"variant"`
	Format      string    `json:"format"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// CreateEvent inserts a scheduled club event and returns its id.
func (s *ClubExtStore) CreateEvent(ctx context.Context, e *ClubEvent) (string, error) {
	if e.ID == "" {
		e.ID = NewID("clevt")
	}
	if e.Variant == "" {
		e.Variant = "texas-holdem"
	}
	if e.Format == "" {
		e.Format = "cash"
	}
	e.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_event (id, club_id, name, scheduled_at, small_blind, big_blind, variant, format, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		e.ID, e.ClubID, e.Name, e.ScheduledAt, e.SmallBlind, e.BigBlind, e.Variant, e.Format, e.CreatedBy, e.CreatedAt)
	return e.ID, err
}

// ListEvents returns a club's upcoming/recent events (soonest-scheduled first).
func (s *ClubExtStore) ListEvents(ctx context.Context, clubID string, limit int) ([]ClubEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, name, scheduled_at, small_blind, big_blind, variant, format, created_by, created_at
		FROM poker_club_event WHERE club_id=$1 ORDER BY scheduled_at ASC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubEvent{}
	for rows.Next() {
		var e ClubEvent
		if err := rows.Scan(&e.ID, &e.ClubID, &e.Name, &e.ScheduledAt, &e.SmallBlind, &e.BigBlind, &e.Variant, &e.Format, &e.CreatedBy, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// --- Chat ---

// ClubChatMessage is one line in a club's chat channel.
type ClubChatMessage struct {
	ID        string    `json:"id"`
	ClubID    string    `json:"club_id"`
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
}

// SendChat appends a chat message and returns its id.
func (s *ClubExtStore) SendChat(ctx context.Context, m *ClubChatMessage) (string, error) {
	if m.ID == "" {
		m.ID = NewID("clchat")
	}
	m.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_chat (id, club_id, user_id, username, text, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		m.ID, m.ClubID, m.UserID, m.Username, m.Text, m.CreatedAt)
	return m.ID, err
}

// ListChat returns a club's recent chat, newest-first (the caller reverses for
// display if desired).
func (s *ClubExtStore) ListChat(ctx context.Context, clubID string, limit int) ([]ClubChatMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, user_id, username, text, created_at
		FROM poker_club_chat WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubChatMessage{}
	for rows.Next() {
		var m ClubChatMessage
		if err := rows.Scan(&m.ID, &m.ClubID, &m.UserID, &m.Username, &m.Text, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// --- Activity feed ---

// ClubActivity is one entry in a club's activity/audit feed.
type ClubActivity struct {
	ID        string    `json:"id"`
	ClubID    string    `json:"club_id"`
	UserID    string    `json:"user_id"`
	Kind      string    `json:"kind"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

// LogActivity records a club activity entry (best-effort; callers ignore the
// error for non-critical feed writes).
func (s *ClubExtStore) LogActivity(ctx context.Context, clubID, userID, kind, detail string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_activity (id, club_id, user_id, kind, detail, created_at)
		VALUES ($1,$2,$3,$4,$5,NOW())`,
		NewID("clact"), clubID, userID, kind, detail)
	return err
}

// ListActivity returns a club's recent activity feed, newest first.
func (s *ClubExtStore) ListActivity(ctx context.Context, clubID string, limit int) ([]ClubActivity, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, user_id, kind, detail, created_at
		FROM poker_club_activity WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubActivity{}
	for rows.Next() {
		var a ClubActivity
		if err := rows.Scan(&a.ID, &a.ClubID, &a.UserID, &a.Kind, &a.Detail, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// --- small local helpers (domain-prefixed to avoid collisions) ---

func itoaClubsext(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func joinClubsext(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for _, p := range parts[1:] {
		out += sep + p
	}
	return out
}
