package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// SettlementStore is the LOAN ledger for club-issued chips.
//
// The distinction that makes this necessary: the global wallet is the player's
// own money, deposited and KYC'd. Club chips are a LOAN the club extends. So a
// club game does not balance itself when the last hand ends — every player who
// drew club chips holds a position against what they were advanced, and the
// operator has to know who pays whom before the books close.
//
//	advanced 1,000, carried off 200   -> net -800, the PLAYER OWES THE CLUB 800
//	advanced 1,000, carried off 1,800 -> net +800, the CLUB OWES THE PLAYER 800
//
// Deliberately separate from GuestSessionStore, which answers "has this guest
// been reconciled at all". This answers "what is the number, and has an owner
// signed it off" — and it covers members too, when the club has member play on
// loan.
type SettlementStore struct{ db *sql.DB }

func NewSettlementStore(db *sql.DB) *SettlementStore { return &SettlementStore{db: db} }

const (
	SettlementOpen      = "open"
	SettlementConfirmed = "confirmed"
)

// ErrSettlementConfirmed means the books were already signed off. Same atomic
// guard as GuestApprovalStore.Decide: a second confirmation is reported, never
// silently applied on top of the first.
var ErrSettlementConfirmed = errors.New("settlement already confirmed")

// SettlementLine is one player's position against what the club advanced them.
type SettlementLine struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	IsMember bool   `json:"is_member"`
	// Loaned accumulates every club-chip buy-in taken to the table, Returned
	// every stack that came back — so a player who sits, stands and sits again
	// settles once on the whole session rather than per seat.
	Loaned   int64 `json:"loaned_minor"`
	Returned int64 `json:"returned_minor"`
	// Net = Returned - Loaned. Negative: the player owes the club. Positive:
	// the club owes the player. Computed on read, never stored — a stored
	// total is one more thing that can disagree with its own inputs.
	Net int64 `json:"net_minor"`
}

// Settlement is a club table's whole position, plus the operator's sign-off.
type Settlement struct {
	ID          string           `json:"id"`
	ClubID      string           `json:"club_id"`
	MatchID     string           `json:"match_id"`
	Status      string           `json:"status"`
	ConfirmedBy string           `json:"confirmed_by"`
	CreatedAt   time.Time        `json:"created_at"`
	ConfirmedAt *time.Time       `json:"confirmed_at,omitempty"`
	Lines       []SettlementLine `json:"lines"`
	// TotalOwedToClub and TotalOwedToPlayers are the two sides of the
	// who-pays-whom list. In a closed system they are equal: chips lost by one
	// player were won by another. A DIFFERENCE means the table leaked, and the
	// operator should see that rather than a single netted number that hides it.
	TotalOwedToClub    int64 `json:"total_owed_to_club"`
	TotalOwedToPlayers int64 `json:"total_owed_to_players"`
}

// RecordSeat accumulates one seat's loan and return onto the player's line,
// creating the settlement header on first use.
//
// Called from the club branch of the buy-in release path, where `loaned` is
// what was locked at sit-down and `returned` is the stack actually leaving the
// table. Both are ADDED, not replaced: re-buys and repeated sittings all belong
// to one position.
//
// Never blocks play. A settlement is bookkeeping the operator reads afterwards;
// failing to write a line must not stop a player cashing out, so callers log
// the error and carry on.
func (s *SettlementStore) RecordSeat(ctx context.Context, clubID, matchID, userID, username string, isMember bool, loaned, returned int64) error {
	if clubID == "" || matchID == "" || userID == "" {
		return errors.New("club_id, match_id and user_id required")
	}
	if loaned == 0 && returned == 0 {
		return nil
	}
	var settlementID string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_table_settlement (id, club_id, match_id, status)
		VALUES ($1,$2,$3,'open')
		ON CONFLICT (club_id, match_id) DO UPDATE SET club_id = EXCLUDED.club_id
		RETURNING id`,
		NewID("stl"), clubID, matchID).Scan(&settlementID)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO poker_table_settlement_line
			(id, settlement_id, user_id, username, is_member, loaned_minor, returned_minor)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (settlement_id, user_id) DO UPDATE SET
			loaned_minor   = poker_table_settlement_line.loaned_minor   + EXCLUDED.loaned_minor,
			returned_minor = poker_table_settlement_line.returned_minor + EXCLUDED.returned_minor,
			username       = COALESCE(NULLIF(EXCLUDED.username,''), poker_table_settlement_line.username),
			updated_at     = NOW()`,
		NewID("stll"), settlementID, userID, username, isMember, loaned, returned)
	return err
}

// Get returns one table's settlement with its lines, or nil when the table
// never issued club chips.
func (s *SettlementStore) Get(ctx context.Context, clubID, matchID string) (*Settlement, error) {
	var st Settlement
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, match_id, status, confirmed_by, created_at, confirmed_at
		  FROM poker_table_settlement WHERE club_id=$1 AND match_id=$2`,
		clubID, matchID,
	).Scan(&st.ID, &st.ClubID, &st.MatchID, &st.Status, &st.ConfirmedBy, &st.CreatedAt, &st.ConfirmedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := s.loadLines(ctx, &st); err != nil {
		return nil, err
	}
	return &st, nil
}

func (s *SettlementStore) loadLines(ctx context.Context, st *Settlement) error {
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id, username, is_member, loaned_minor, returned_minor
		  FROM poker_table_settlement_line
		 WHERE settlement_id=$1
		 ORDER BY (returned_minor - loaned_minor) ASC`, st.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	st.Lines = []SettlementLine{}
	for rows.Next() {
		var l SettlementLine
		if err := rows.Scan(&l.UserID, &l.Username, &l.IsMember, &l.Loaned, &l.Returned); err != nil {
			return err
		}
		l.Net = l.Returned - l.Loaned
		if l.Net < 0 {
			st.TotalOwedToClub += -l.Net
		} else {
			st.TotalOwedToPlayers += l.Net
		}
		st.Lines = append(st.Lines, l)
	}
	return rows.Err()
}

// ListOpen returns a club's unconfirmed settlements, oldest first — the
// operator's queue of games whose books have not been signed off.
func (s *SettlementStore) ListOpen(ctx context.Context, clubID string) ([]Settlement, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, match_id, status, confirmed_by, created_at, confirmed_at
		  FROM poker_table_settlement
		 WHERE club_id=$1 AND status='open'
		 ORDER BY created_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Settlement{}
	for rows.Next() {
		var st Settlement
		if err := rows.Scan(&st.ID, &st.ClubID, &st.MatchID, &st.Status, &st.ConfirmedBy,
			&st.CreatedAt, &st.ConfirmedAt); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if err := s.loadLines(ctx, &out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Confirm records the operator's sign-off, exactly once.
//
// The `status='open'` predicate is the whole concurrency story, same as
// GuestApprovalStore.Decide: two operators confirming the same books produce
// one winner and one ErrSettlementConfirmed, never a row that silently
// re-confirms under someone who already acted on it.
func (s *SettlementStore) Confirm(ctx context.Context, clubID, matchID, by string) (*Settlement, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_table_settlement
		   SET status='confirmed', confirmed_by=$3, confirmed_at=NOW()
		 WHERE club_id=$1 AND match_id=$2 AND status='open'`, clubID, matchID, by)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrSettlementConfirmed
	}
	return s.Get(ctx, clubID, matchID)
}
