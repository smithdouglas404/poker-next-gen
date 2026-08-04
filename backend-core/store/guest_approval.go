package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// GuestApprovalStore is the gate a coded GUEST passes before taking a seat.
//
// The rule it enforces: a visitor holding a table code may watch straight away,
// but if they are not a registered member, a club operator (or the host) has to
// approve them before they can sit and hold a balance. A code that gets
// forwarded around otherwise seats an unbounded number of strangers, each with
// chips, at a table the club is accountable for.
//
// Deliberately separate from GuestSessionStore. That one opens when a guest has
// ALREADY sat and exists to settle their chips when they leave. This is the
// gate in front of it; they meet only in the sense that an approved guest goes
// on to get a GuestSession.
type GuestApprovalStore struct{ db *sql.DB }

func NewGuestApprovalStore(db *sql.DB) *GuestApprovalStore { return &GuestApprovalStore{db: db} }

// Approval states. A row is created pending and decided exactly once.
const (
	GuestApprovalPending  = "pending"
	GuestApprovalApproved = "approved"
	GuestApprovalDenied   = "denied"
)

// ErrGuestApprovalDecided means someone else already decided this request —
// the atomic guard fired. Not a failure: the queue just moved on.
var ErrGuestApprovalDecided = errors.New("guest approval already decided")

// GuestApproval is one coded guest waiting on (or holding) a decision.
type GuestApproval struct {
	ID       string `json:"id"`
	ClubID   string `json:"club_id"`
	MatchID  string `json:"match_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	JoinCode string `json:"join_code"`
	// What the approver gets to judge on. DeviceFP is the useful one: it is how
	// "this device is already sitting under another name" becomes visible.
	DeviceFP   string     `json:"device_fp"`
	JoinIP     string     `json:"join_ip"`
	Status     string     `json:"status"`
	DecidedBy  string     `json:"decided_by"`
	Reason     string     `json:"reason"`
	CreatedAt  time.Time  `json:"created_at"`
	DecidedAt  *time.Time `json:"decided_at,omitempty"`
	// SameDeviceSeated is computed at list time, not stored: how many OTHER
	// users at this club have been approved on the same device fingerprint.
	SameDeviceSeated int `json:"same_device_seated"`
}

// Request records a coded guest asking to sit, returning the current row.
//
// Idempotent per (match, user): a guest who reloads the page, reconnects, or
// clicks twice must not stack duplicate rows in the operator's queue. A repeat
// call returns the EXISTING row untouched, so a decision already made is never
// silently reset back to pending by a reconnect.
func (s *GuestApprovalStore) Request(ctx context.Context, g *GuestApproval) (*GuestApproval, error) {
	if g.MatchID == "" || g.UserID == "" {
		return nil, errors.New("match_id and user_id required")
	}
	if g.ID == "" {
		g.ID = NewID("ga")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_guest_approval
			(id, club_id, match_id, user_id, username, email, join_code, device_fp, join_ip, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
		ON CONFLICT (match_id, user_id) DO NOTHING`,
		g.ID, g.ClubID, g.MatchID, g.UserID, g.Username, g.Email, g.JoinCode, g.DeviceFP, g.JoinIP)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, g.MatchID, g.UserID)
}

// Get returns the approval row for a (match, user), or nil when none exists.
func (s *GuestApprovalStore) Get(ctx context.Context, matchID, userID string) (*GuestApproval, error) {
	var g GuestApproval
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, match_id, user_id, username, email, join_code, device_fp, join_ip,
		       status, decided_by, reason, created_at, decided_at
		  FROM poker_guest_approval WHERE match_id = $1 AND user_id = $2`,
		matchID, userID,
	).Scan(&g.ID, &g.ClubID, &g.MatchID, &g.UserID, &g.Username, &g.Email, &g.JoinCode,
		&g.DeviceFP, &g.JoinIP, &g.Status, &g.DecidedBy, &g.Reason, &g.CreatedAt, &g.DecidedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// IsApproved answers the sit-down gate's question.
//
// Fails CLOSED: any error, or no row at all, means not approved. A database
// hiccup must not become an open door — the cost of a wrong "false" is one
// person waiting, the cost of a wrong "true" is an unidentified player holding
// a balance at a table the club has to answer for.
func (s *GuestApprovalStore) IsApproved(ctx context.Context, matchID, userID string) bool {
	g, err := s.Get(ctx, matchID, userID)
	if err != nil || g == nil {
		return false
	}
	return g.Status == GuestApprovalApproved
}

// Approve records an automatic approval — used when a table opts into
// "trust anyone with the code". Recorded as a real decision by "system" rather
// than skipping the queue, so the operator's audit trail still shows every
// guest who sat and on whose authority.
func (s *GuestApprovalStore) AutoApprove(ctx context.Context, g *GuestApproval) error {
	if _, err := s.Request(ctx, g); err != nil {
		return err
	}
	_, err := s.Decide(ctx, g.MatchID, g.UserID, GuestApprovalApproved, "system", "table trusts code holders")
	if errors.Is(err, ErrGuestApprovalDecided) {
		return nil // already decided by a human; their decision wins
	}
	return err
}

// ListPending returns a club's undecided requests, oldest first, annotated with
// how many OTHER users share each device fingerprint at this club.
func (s *GuestApprovalStore) ListPending(ctx context.Context, clubID string) ([]GuestApproval, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.club_id, a.match_id, a.user_id, a.username, a.email, a.join_code,
		       a.device_fp, a.join_ip, a.status, a.decided_by, a.reason, a.created_at, a.decided_at,
		       COALESCE((
		         SELECT COUNT(DISTINCT b.user_id) FROM poker_guest_approval b
		          WHERE b.club_id = a.club_id AND b.device_fp = a.device_fp
		            AND b.device_fp <> '' AND b.user_id <> a.user_id
		       ), 0) AS same_device
		  FROM poker_guest_approval a
		 WHERE a.club_id = $1 AND a.status = 'pending'
		 ORDER BY a.created_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GuestApproval{}
	for rows.Next() {
		var g GuestApproval
		if err := rows.Scan(&g.ID, &g.ClubID, &g.MatchID, &g.UserID, &g.Username, &g.Email,
			&g.JoinCode, &g.DeviceFP, &g.JoinIP, &g.Status, &g.DecidedBy, &g.Reason,
			&g.CreatedAt, &g.DecidedAt, &g.SameDeviceSeated); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// Decide resolves a pending request exactly once.
//
// The `status = 'pending'` predicate in the UPDATE is the whole concurrency
// story: two operators hitting Approve and Deny at the same moment produce one
// winner and one ErrGuestApprovalDecided, never a row that flips after someone
// already acted on it. Same guard the credit-request flow uses.
func (s *GuestApprovalStore) Decide(ctx context.Context, matchID, userID, status, by, reason string) (*GuestApproval, error) {
	if status != GuestApprovalApproved && status != GuestApprovalDenied {
		return nil, errors.New("status must be approved or denied")
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_guest_approval
		   SET status = $3, decided_by = $4, reason = $5, decided_at = NOW()
		 WHERE match_id = $1 AND user_id = $2 AND status = 'pending'`,
		matchID, userID, status, by, reason)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrGuestApprovalDecided
	}
	return s.Get(ctx, matchID, userID)
}
