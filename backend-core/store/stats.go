package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// StatsStore reads the per-hand analytics tables (poker_hand_stats,
// poker_hand_index, poker_hrp_event). The hot-path writers live in the match
// loop (attributeHand); this store is the read/aggregation side that powers the
// analytics, leak-report, hand-history, head-to-head and HRP-history RPCs.
type StatsStore struct{ db *sql.DB }

func NewStatsStore(db *sql.DB) *StatsStore { return &StatsStore{db: db} }

// StatsAggregate is a rolled-up view over a player's per-hand stat rows. Counts
// are raw tallies; the RPC layer turns them into VPIP/PFR/AF/WTSD percentages.
type StatsAggregate struct {
	Hands        int64 `json:"hands"`
	VPIPHands    int64 `json:"vpip_hands"`
	PFRHands     int64 `json:"pfr_hands"`
	Showdowns    int64 `json:"showdowns"`
	Wins         int64 `json:"wins"`
	ShowdownWins int64 `json:"showdown_wins"`
	NetCents     int64 `json:"net_cents"`
	BetsRaises   int64 `json:"bets_raises"`
	Calls        int64 `json:"calls"`
}

// Aggregate rolls up a user's per-hand rows, optionally scoped to a club. A user
// with no recorded hands yields a zero-valued aggregate (never an error).
func (s *StatsStore) Aggregate(ctx context.Context, userID, clubID string) (*StatsAggregate, error) {
	q := `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN vpip THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN pfr THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN went_to_showdown THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN won THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN won AND went_to_showdown THEN 1 ELSE 0 END),0),
			COALESCE(SUM(net_cents),0),
			COALESCE(SUM(bets_raises),0),
			COALESCE(SUM(calls),0)
		FROM poker_hand_stats WHERE user_id=$1`
	args := []interface{}{userID}
	if clubID != "" {
		q += ` AND club_id=$2`
		args = append(args, clubID)
	}
	var a StatsAggregate
	err := s.db.QueryRowContext(ctx, q, args...).Scan(
		&a.Hands, &a.VPIPHands, &a.PFRHands, &a.Showdowns, &a.Wins,
		&a.ShowdownWins, &a.NetCents, &a.BetsRaises, &a.Calls)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	return &a, nil
}

// H2HRecord is one player's head-to-head record versus a single opponent, over
// the hands they both played.
type H2HRecord struct {
	Hands       int64 `json:"hands"`
	MyWins      int64 `json:"my_wins"`
	OppWins     int64 `json:"opp_wins"`
	MyNetCents  int64 `json:"my_net_cents"`
	OppNetCents int64 `json:"opp_net_cents"`
	Showdowns   int64 `json:"showdowns"`
}

// HeadToHead computes userID's record against opponentID by self-joining
// poker_hand_stats on (match_id, hand_no) — i.e. hands both sat in. Optionally
// scoped to a club.
func (s *StatsStore) HeadToHead(ctx context.Context, userID, opponentID, clubID string) (*H2HRecord, error) {
	q := `
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN a.won THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN b.won THEN 1 ELSE 0 END),0),
			COALESCE(SUM(a.net_cents),0),
			COALESCE(SUM(b.net_cents),0),
			COALESCE(SUM(CASE WHEN a.went_to_showdown AND b.went_to_showdown THEN 1 ELSE 0 END),0)
		FROM poker_hand_stats a
		JOIN poker_hand_stats b ON a.match_id=b.match_id AND a.hand_no=b.hand_no
		WHERE a.user_id=$1 AND b.user_id=$2`
	args := []interface{}{userID, opponentID}
	if clubID != "" {
		q += ` AND a.club_id=$3`
		args = append(args, clubID)
	}
	var r H2HRecord
	err := s.db.QueryRowContext(ctx, q, args...).Scan(
		&r.Hands, &r.MyWins, &r.OppWins, &r.MyNetCents, &r.OppNetCents, &r.Showdowns)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	return &r, nil
}

// HandIndexRow is one row of the searchable hand list, joined with the caller's
// own per-hand result (net/won) so the history reads as "my hands".
type HandIndexRow struct {
	ID          string          `json:"id"`
	MatchID     string          `json:"match_id"`
	RoomID      string          `json:"room_id"`
	TableLabel  string          `json:"table_label"`
	HandNo      int             `json:"hand_no"`
	UserIDs     json.RawMessage `json:"user_ids"`
	WinnerSeats json.RawMessage `json:"winner_seats"`
	Pot         int64           `json:"pot"`
	Rake        int64           `json:"rake"`
	DeckCommit  string          `json:"deck_commit"`
	Anchored    bool            `json:"anchored"`
	AnchorTx    string          `json:"anchor_tx"`
	NetCents    int64           `json:"net_cents"`
	Won         bool            `json:"won"`
	CreatedAt   time.Time       `json:"created_at"`
}

// HandHistory returns the caller's hands, newest first, joining poker_hand_index
// with the caller's own poker_hand_stats row. Optionally filtered by match and
// to anchored (on-chain) hands only.
func (s *StatsStore) HandHistory(ctx context.Context, userID, matchID string, onChainOnly bool, limit, offset int) ([]HandIndexRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	q := `
		SELECT hi.id, hi.match_id, hi.room_id, hi.table_label, hi.hand_no,
		       hi.user_ids_json, hi.winner_seats_json, hi.pot, hi.rake,
		       hi.deck_commit, hi.anchored, hi.anchor_tx,
		       COALESCE(hs.net_cents,0), COALESCE(hs.won,FALSE), hi.created_at
		FROM poker_hand_index hi
		JOIN poker_hand_stats hs ON hs.match_id=hi.match_id AND hs.hand_no=hi.hand_no
		WHERE hs.user_id=$1`
	args := []interface{}{userID}
	n := 2
	if matchID != "" {
		q += fmt.Sprintf(` AND hi.match_id=$%d`, n)
		args = append(args, matchID)
		n++
	}
	if onChainOnly {
		q += ` AND hi.anchored`
	}
	q += fmt.Sprintf(` ORDER BY hi.created_at DESC, hi.id DESC LIMIT $%d OFFSET $%d`, n, n+1)
	args = append(args, limit, offset)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HandIndexRow{}
	for rows.Next() {
		var h HandIndexRow
		if err := rows.Scan(&h.ID, &h.MatchID, &h.RoomID, &h.TableLabel, &h.HandNo,
			&h.UserIDs, &h.WinnerSeats, &h.Pot, &h.Rake, &h.DeckCommit, &h.Anchored,
			&h.AnchorTx, &h.NetCents, &h.Won, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// HRPEvent is one High Roller Points ledger entry (the loyalty/HRP history feed).
type HRPEvent struct {
	ID        string          `json:"id"`
	UserID    string          `json:"user_id"`
	HRP       int64           `json:"hrp"`
	Reason    string          `json:"reason"`
	Meta      json.RawMessage `json:"meta,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// RecordHRP appends an HRP event. The match-loop accrual hook is the primary
// writer; this exists so any producer can persist a per-event row that
// loyalty_history reads back.
func (s *StatsStore) RecordHRP(ctx context.Context, userID string, hrp int64, reason string, meta json.RawMessage) error {
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_hrp_event (id, user_id, hrp, reason, meta_json, created_at)
		VALUES ($1,$2,$3,$4,$5,NOW())`,
		NewID("hrp"), userID, hrp, reason, []byte(meta))
	return err
}

// HRPEvents returns a user's HRP history, newest first.
func (s *StatsStore) HRPEvents(ctx context.Context, userID string, limit, offset int) ([]HRPEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, hrp, reason, meta_json, created_at
		FROM poker_hrp_event WHERE user_id=$1
		ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HRPEvent{}
	for rows.Next() {
		var e HRPEvent
		if err := rows.Scan(&e.ID, &e.UserID, &e.HRP, &e.Reason, &e.Meta, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
