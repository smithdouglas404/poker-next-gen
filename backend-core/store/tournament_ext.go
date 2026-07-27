package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// TournamentExtStore backs the tournament read/analytics + config domain
// ("tournext"): a live snapshot of an in-flight tournament, financial
// analytics, and the config columns added by the tournext ALTER
// (late_reg_secs, time_bank_secs, format). It is a thin wrapper over *sql.DB and
// returns (nil, nil) on sql.ErrNoRows, matching the house store pattern (see
// store/club.go, store/cosmetics.go). It reads the same tables the tournament
// director writes (poker_tournament, poker_tournament_registration,
// poker_tournament_table) — it never mutates match/director state, only the
// config columns and settlement.
type TournamentExtStore struct{ db *sql.DB }

func NewTournamentExtStore(db *sql.DB) *TournamentExtStore { return &TournamentExtStore{db: db} }

// TournamentExtInfo carries the base tournament fields plus the tournext config
// columns. Missing config columns COALESCE to their defaults so a snapshot works
// even before the ALTER runs on a given row.
type TournamentExtInfo struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Status          string    `json:"status"`
	Variant         string    `json:"variant"`
	BuyInMinor      int64     `json:"buy_in_minor"`
	FeeMinor        int64     `json:"fee_minor"`
	StartingStack   int64     `json:"starting_stack"`
	MaxPlayers      int32     `json:"max_players"`
	CurrentLevel    int       `json:"current_level"`
	LevelStartedAt  time.Time `json:"level_started_at"`
	DirectorMatchID string    `json:"director_match_id"`
	LateRegSecs     int       `json:"late_reg_secs"`
	TimeBankSecs    int       `json:"time_bank_secs"`
	Format          string    `json:"format"`
	ScheduledAt     time.Time `json:"scheduled_at"`
	// Builder config (HRC comprehensive_tournament_setup). Read by
	// TournamentMoney for the pool/rake split and by RegistrationOpen for the
	// operating-hours window.
	AdminFeeBps         int32 `json:"admin_fee_bps"`
	GuaranteeMinor      int64 `json:"guarantee_minor"`
	OperatingStartMin   int32 `json:"operating_start_min"`
	OperatingEndMin     int32 `json:"operating_end_min"`
	AutoAwayOnTimeout   bool  `json:"auto_away_on_timeout"`
	TimeBankPerHandSecs int32 `json:"time_bank_per_hand_secs"`
}

// Bracket projects the snapshot back onto the canonical model so the shared
// money/registration helpers (TournamentMoney, RegistrationOpen) take exactly
// one input type — the pool must never be computed from two different shapes.
func (t *TournamentExtInfo) Bracket() *models.TournamentBracket {
	return &models.TournamentBracket{
		ID:                  t.ID,
		Name:                t.Name,
		Status:              t.Status,
		Variant:             t.Variant,
		BuyInMinor:          t.BuyInMinor,
		FeeMinor:            t.FeeMinor,
		StartingStack:       t.StartingStack,
		MaxPlayers:          t.MaxPlayers,
		ScheduledAt:         t.ScheduledAt,
		LateRegSecs:         int32(t.LateRegSecs),
		TimeBankSecs:        int32(t.TimeBankSecs),
		AdminFeeBps:         t.AdminFeeBps,
		GuaranteeMinor:      t.GuaranteeMinor,
		OperatingStartMin:   t.OperatingStartMin,
		OperatingEndMin:     t.OperatingEndMin,
		AutoAwayOnTimeout:   t.AutoAwayOnTimeout,
		TimeBankPerHandSecs: t.TimeBankPerHandSecs,
	}
}

// GetInfo returns a tournament's base + config fields, or (nil, nil) if missing.
func (s *TournamentExtStore) GetInfo(ctx context.Context, tournamentID string) (*TournamentExtInfo, error) {
	var t TournamentExtInfo
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, status, variant, buy_in_minor, fee_minor, starting_stack, max_players,
		       COALESCE(current_level,0), COALESCE(level_started_at,NOW()), COALESCE(director_match_id,''),
		       COALESCE(late_reg_secs,0), COALESCE(time_bank_secs,0), COALESCE(format,'mtt'), scheduled_at,
		       COALESCE(admin_fee_bps,0), COALESCE(guarantee_minor,0),
		       COALESCE(operating_start_min,0), COALESCE(operating_end_min,0),
		       COALESCE(auto_away_on_timeout,FALSE), COALESCE(time_bank_per_hand_secs,0)
		FROM poker_tournament WHERE id=$1`, tournamentID).
		Scan(&t.ID, &t.Name, &t.Status, &t.Variant, &t.BuyInMinor, &t.FeeMinor, &t.StartingStack, &t.MaxPlayers,
			&t.CurrentLevel, &t.LevelStartedAt, &t.DirectorMatchID,
			&t.LateRegSecs, &t.TimeBankSecs, &t.Format, &t.ScheduledAt,
			&t.AdminFeeBps, &t.GuaranteeMinor, &t.OperatingStartMin, &t.OperatingEndMin,
			&t.AutoAwayOnTimeout, &t.TimeBankPerHandSecs)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// SetConfig updates the tournext config columns (late registration window,
// per-player time bank, and format). Callers validate `format`.
func (s *TournamentExtStore) SetConfig(ctx context.Context, tournamentID string, lateRegSecs, timeBankSecs int, format string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament
		SET late_reg_secs=$2, time_bank_secs=$3, format=$4, updated_at=NOW()
		WHERE id=$1`, tournamentID, lateRegSecs, timeBankSecs, format)
	return err
}

// TournamentRules is the editable builder config, separate from SetConfig so the
// existing three-field call sites keep working untouched.
type TournamentRules struct {
	AdminFeeBps         int32
	GuaranteeMinor      int64
	OperatingStartMin   int32
	OperatingEndMin     int32
	AutoAwayOnTimeout   bool
	TimeBankPerHandSecs int32
}

// SetRules persists the builder's Financials/Rules tabs. Values are validated by
// the caller (rpc.TournamentConfig) — this is storage only.
func (s *TournamentExtStore) SetRules(ctx context.Context, tournamentID string, r TournamentRules) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament
		SET admin_fee_bps=$2, guarantee_minor=$3, operating_start_min=$4,
		    operating_end_min=$5, auto_away_on_timeout=$6, time_bank_per_hand_secs=$7,
		    updated_at=NOW()
		WHERE id=$1`, tournamentID, r.AdminFeeBps, r.GuaranteeMinor, r.OperatingStartMin,
		r.OperatingEndMin, r.AutoAwayOnTimeout, r.TimeBankPerHandSecs)
	return err
}

// RegisteredCount returns the total number of registrations (any status).
func (s *TournamentExtStore) RegisteredCount(ctx context.Context, tournamentID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_tournament_registration WHERE tournament_id=$1`, tournamentID).Scan(&n)
	return n, err
}

// ClubTournamentFeesRow is one tournament's real fee/entry contribution.
type ClubTournamentFeesRow struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	FeeMinor    int64  `json:"fee_minor"`
	BuyInMinor  int64  `json:"buy_in_minor"`
	Entries     int64  `json:"entries"`
	FeeTotal    int64  `json:"fee_total"`
	BuyInTotal  int64  `json:"buy_in_total"`
}

// ClubTournamentFees sums the club's real tournament-fee revenue — the entry fee
// (fee_minor) charged per registration, over every tournament owned by the club,
// optionally within a trailing window. This is the authoritative replacement for
// the client-side "≈25% of rake" model. Returns the grand total plus a per-
// tournament breakdown (newest first). `interval` is a fixed Postgres literal
// chosen by the caller (never user-supplied); empty means all-time.
func (s *TournamentExtStore) ClubTournamentFees(ctx context.Context, clubID, interval string) (int64, int64, int64, []ClubTournamentFeesRow, error) {
	where := "t.club_id=$1"
	if interval != "" {
		where += " AND t.created_at >= NOW() - INTERVAL '" + interval + "'"
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.name, t.status, t.fee_minor, t.buy_in_minor,
		       COALESCE(r.cnt, 0) AS entries
		FROM poker_tournament t
		LEFT JOIN (
			SELECT tournament_id, COUNT(*) AS cnt
			FROM poker_tournament_registration GROUP BY tournament_id
		) r ON r.tournament_id = t.id
		WHERE `+where+`
		ORDER BY t.created_at DESC`, clubID)
	if err != nil {
		return 0, 0, 0, nil, err
	}
	defer rows.Close()
	var feeTotal, buyInTotal, entryTotal int64
	out := []ClubTournamentFeesRow{}
	for rows.Next() {
		var r ClubTournamentFeesRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Status, &r.FeeMinor, &r.BuyInMinor, &r.Entries); err != nil {
			return 0, 0, 0, nil, err
		}
		r.FeeTotal = r.FeeMinor * r.Entries
		r.BuyInTotal = r.BuyInMinor * r.Entries
		feeTotal += r.FeeTotal
		buyInTotal += r.BuyInTotal
		entryTotal += r.Entries
		out = append(out, r)
	}
	return feeTotal, buyInTotal, entryTotal, out, rows.Err()
}

// PlayersLeft returns the number of still-alive entrants (registered or
// playing, i.e. not yet busted). During the registering phase this equals the
// registered count.
func (s *TournamentExtStore) PlayersLeft(ctx context.Context, tournamentID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_tournament_registration
		 WHERE tournament_id=$1 AND status IN ('registered','playing')`, tournamentID).Scan(&n)
	return n, err
}

// TournamentExtTableCount is the number of seated (playing) entrants at a table.
type TournamentExtTableCount struct {
	MatchID string `json:"match_id"`
	Players int    `json:"players"`
}

// TableCounts returns the live per-table player counts (playing status only).
func (s *TournamentExtStore) TableCounts(ctx context.Context, tournamentID string) ([]TournamentExtTableCount, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT match_id, COUNT(*) FROM poker_tournament_registration
		WHERE tournament_id=$1 AND status='playing' AND match_id <> ''
		GROUP BY match_id ORDER BY match_id`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TournamentExtTableCount{}
	for rows.Next() {
		var c TournamentExtTableCount
		if err := rows.Scan(&c.MatchID, &c.Players); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// TournamentExtStanding is a single row in the chip-count leaderboard.
type TournamentExtStanding struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	Stack       int64  `json:"stack"`
	Status      string `json:"status"`
	FinishPlace int    `json:"finish_place"`
}

// ChipStandings returns the chip-count leaderboard, alive players (highest stack)
// first, then busted players. `limit` caps the rows returned.
func (s *TournamentExtStore) ChipStandings(ctx context.Context, tournamentID string, limit int) ([]TournamentExtStanding, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id, username, stack, status, COALESCE(finish_place,0)
		FROM poker_tournament_registration
		WHERE tournament_id=$1
		ORDER BY (status='busted') ASC, stack DESC
		LIMIT $2`, tournamentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TournamentExtStanding{}
	for rows.Next() {
		var st TournamentExtStanding
		if err := rows.Scan(&st.UserID, &st.Username, &st.Stack, &st.Status, &st.FinishPlace); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// TournamentExtElimination is a busted player with a recorded finishing place.
type TournamentExtElimination struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	FinishPlace int    `json:"finish_place"`
}

// Eliminations returns busted players, most recently eliminated first. `limit`
// caps the rows returned.
func (s *TournamentExtStore) Eliminations(ctx context.Context, tournamentID string, limit int) ([]TournamentExtElimination, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id, username, COALESCE(finish_place,0)
		FROM poker_tournament_registration
		WHERE tournament_id=$1 AND status='busted'
		ORDER BY updated_at DESC
		LIMIT $2`, tournamentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TournamentExtElimination{}
	for rows.Next() {
		var e TournamentExtElimination
		if err := rows.Scan(&e.UserID, &e.Username, &e.FinishPlace); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
