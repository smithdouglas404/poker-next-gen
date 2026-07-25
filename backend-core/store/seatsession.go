package store

import (
	"context"
	"database/sql"
	"time"
)

// SeatSessionStore records one "sitting" — a player taking a seat until they
// leave — for hit-and-run / ratholing visibility (Tier-1 C). Unlike
// GuestSessionStore (guest-only, operator chip reconciliation), this covers ALL
// non-bot players and captures play DURATION, hands played, and stack-on-leave so
// an operator can see who bought in, won a little, and immediately left ("hit and
// run"), or who left and re-bought shorter to lock in a win ("ratholing"). It is
// advisory data — nothing here blocks play (the only hard block is the Tier-0
// mid-hand cashout-lock). Every sitting is Open()ed on sit and Close()d exactly
// once on leave via an atomic status guard.
type SeatSessionStore struct{ db *sql.DB }

func NewSeatSessionStore(db *sql.DB) *SeatSessionStore { return &SeatSessionStore{db: db} }

// SeatSession is one player's appearance in a seat, sit → leave.
type SeatSession struct {
	ID                string     `json:"id"`
	MatchID           string     `json:"match_id"`
	ClubID            string     `json:"club_id"`
	UserID            string     `json:"user_id"`
	Username          string     `json:"username"`
	BuyInMinor        int64      `json:"buy_in_minor"`        // cumulative buy-in this sitting (initial + rebuys)
	HandsPlayed       int        `json:"hands_played"`        // hands dealt while seated
	StackAtLeaveMinor int64      `json:"stack_at_leave_minor"` // chips carried out
	NetMinor          int64      `json:"net_minor"`           // stack_at_leave − buy_in (win/loss this sitting)
	Ratholed          bool       `json:"ratholed"`            // re-bought short soon after leaving bigger
	HitAndRun         bool       `json:"hit_and_run"`         // left with a win after very few hands
	Status            string     `json:"status"`              // open | closed
	SatAt             time.Time  `json:"sat_at"`
	LeftAt            *time.Time `json:"left_at,omitempty"`
}

// Open inserts an open sitting and returns its id. Ratholed is decided by the
// caller (from LastClosedAtTable) at sit time.
func (s *SeatSessionStore) Open(ctx context.Context, ss *SeatSession) (string, error) {
	if ss.ID == "" {
		ss.ID = NewID("seat")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_seat_session (id, match_id, club_id, user_id, username, buy_in_minor, ratholed, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'open')`,
		ss.ID, ss.MatchID, ss.ClubID, ss.UserID, ss.Username, ss.BuyInMinor, ss.Ratholed)
	return ss.ID, err
}

// Close atomically finalizes an open sitting, recording the final cumulative
// buy-in, hands played, stack carried out, net, and the hit-and-run flag. Returns
// false if it was not still open, so a sitting closes exactly once even if two
// exit paths race.
func (s *SeatSessionStore) Close(ctx context.Context, id string, buyInMinor int64, hands int, stackAtLeave, net int64, hitAndRun bool) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_seat_session
		SET status='closed', buy_in_minor=$2, hands_played=$3, stack_at_leave_minor=$4,
		    net_minor=$5, hit_and_run=$6, left_at=NOW()
		WHERE id=$1 AND status='open'`, id, buyInMinor, hands, stackAtLeave, net, hitAndRun)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// LastClosedAtTable returns the player's most recent CLOSED sitting at a given
// match (nil if none), used to decide ratholing when they re-sit.
func (s *SeatSessionStore) LastClosedAtTable(ctx context.Context, matchID, userID string) (*SeatSession, error) {
	var ss SeatSession
	var left sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, match_id, club_id, user_id, username, buy_in_minor, hands_played, stack_at_leave_minor,
		       net_minor, ratholed, hit_and_run, status, sat_at, left_at
		FROM poker_seat_session
		WHERE match_id=$1 AND user_id=$2 AND status='closed'
		ORDER BY left_at DESC LIMIT 1`, matchID, userID).
		Scan(&ss.ID, &ss.MatchID, &ss.ClubID, &ss.UserID, &ss.Username, &ss.BuyInMinor, &ss.HandsPlayed,
			&ss.StackAtLeaveMinor, &ss.NetMinor, &ss.Ratholed, &ss.HitAndRun, &ss.Status, &ss.SatAt, &left)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if left.Valid {
		ss.LeftAt = &left.Time
	}
	return &ss, nil
}

// ListForClub returns recent sittings across a club's tables (newest first),
// for the owner-hub Seat Sessions panel.
func (s *SeatSessionStore) ListForClub(ctx context.Context, clubID string, limit int) ([]SeatSession, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, match_id, club_id, user_id, username, buy_in_minor, hands_played, stack_at_leave_minor,
		       net_minor, ratholed, hit_and_run, status, sat_at, left_at
		FROM poker_seat_session WHERE club_id=$1 ORDER BY sat_at DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SeatSession{}
	for rows.Next() {
		var ss SeatSession
		var left sql.NullTime
		if err := rows.Scan(&ss.ID, &ss.MatchID, &ss.ClubID, &ss.UserID, &ss.Username, &ss.BuyInMinor,
			&ss.HandsPlayed, &ss.StackAtLeaveMinor, &ss.NetMinor, &ss.Ratholed, &ss.HitAndRun, &ss.Status,
			&ss.SatAt, &left); err != nil {
			return nil, err
		}
		if left.Valid {
			ss.LeftAt = &left.Time
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}
