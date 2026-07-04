package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

type WalletStore struct{ db *sql.DB }

func NewWalletStore(db *sql.DB) *WalletStore { return &WalletStore{db: db} }

func (s *WalletStore) Ensure(ctx context.Context, userID string) (int64, error) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 100000, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return 0, err
	}
	var bal int64
	err = s.db.QueryRowContext(ctx, `SELECT balance FROM poker_global_wallet WHERE user_id=$1`, userID).Scan(&bal)
	return bal, err
}

func (s *WalletStore) Get(ctx context.Context, userID string) (int64, error) {
	return s.Ensure(ctx, userID)
}

func (s *WalletStore) Debit(ctx context.Context, userID string, amount int64) error {
	if amount <= 0 {
		return nil
	}
	if _, err := s.Ensure(ctx, userID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance-$2, updated_at=NOW()
		WHERE user_id=$1 AND balance>=$2`, userID, amount)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("insufficient balance")
	}
	return nil
}

func (s *WalletStore) Credit(ctx context.Context, userID string, amount int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1`, userID, amount)
	return err
}

type TournamentStore struct{ db *sql.DB }

func NewTournamentStore(db *sql.DB) *TournamentStore { return &TournamentStore{db: db} }

func (s *TournamentStore) Create(ctx context.Context, t *models.TournamentBracket) error {
	t.ID = NewID("mtt")
	now := time.Now().UTC()
	t.CreatedAt, t.UpdatedAt = now, now
	if t.Status == "" {
		t.Status = "registering"
	}
	if t.MaxSeatsPerTable == 0 {
		t.MaxSeatsPerTable = 6
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_tournament (id,name,variant,buy_in_minor,fee_minor,starting_stack,max_players,max_seats_per_table,status,scheduled_at,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		t.ID, t.Name, t.Variant, t.BuyInMinor, t.FeeMinor, t.StartingStack, t.MaxPlayers, t.MaxSeatsPerTable, t.Status, t.ScheduledAt, t.CreatedAt, t.UpdatedAt)
	return err
}

func (s *TournamentStore) List(ctx context.Context) ([]models.TournamentBracket, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id,name,variant,buy_in_minor,fee_minor,starting_stack,max_players,max_seats_per_table,status,scheduled_at,created_at,updated_at
		FROM poker_tournament ORDER BY scheduled_at DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TournamentBracket
	for rows.Next() {
		var t models.TournamentBracket
		if err := rows.Scan(&t.ID, &t.Name, &t.Variant, &t.BuyInMinor, &t.FeeMinor, &t.StartingStack, &t.MaxPlayers, &t.MaxSeatsPerTable, &t.Status, &t.ScheduledAt, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *TournamentStore) Register(ctx context.Context, tournamentID, userID, username string, stack int64) error {
	id := NewID("reg")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_tournament_registration (id,tournament_id,user_id,username,stack,status,created_at)
		VALUES ($1,$2,$3,$4,$5,'registered',NOW()) ON CONFLICT DO NOTHING`,
		id, tournamentID, userID, username, stack)
	return err
}

func (s *TournamentStore) AddBlindLevel(ctx context.Context, b *models.BlindTimer) error {
	b.ID = NewID("blind")
	now := time.Now().UTC()
	b.CreatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_blind_level (id,tournament_id,level,small_blind,big_blind,ante,duration_secs,is_break,created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		b.ID, b.TournamentID, b.Level, b.SmallBlind, b.BigBlind, b.Ante, b.DurationSecs, b.IsBreak, b.CreatedAt)
	return err
}

func (s *TournamentStore) ListBlinds(ctx context.Context, tournamentID string) ([]models.BlindTimer, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id,tournament_id,level,small_blind,big_blind,ante,duration_secs,is_break,created_at
		FROM poker_blind_level WHERE tournament_id=$1 ORDER BY level`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.BlindTimer
	for rows.Next() {
		var b models.BlindTimer
		if err := rows.Scan(&b.ID, &b.TournamentID, &b.Level, &b.SmallBlind, &b.BigBlind, &b.Ante, &b.DurationSecs, &b.IsBreak, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *TournamentStore) AddPrizeTier(ctx context.Context, p *models.PrizeDistributionPool) error {
	p.ID = NewID("prize")
	now := time.Now().UTC()
	p.CreatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_prize_pool (id,tournament_id,rank_from,rank_to,payout_bps,guaranteed_minor,created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		p.ID, p.TournamentID, p.RankFrom, p.RankTo, p.PayoutBps, p.GuaranteedMinor, p.CreatedAt)
	return err
}

func (s *TournamentStore) ListPrizes(ctx context.Context, tournamentID string) ([]models.PrizeDistributionPool, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id,tournament_id,rank_from,rank_to,payout_bps,guaranteed_minor,created_at
		FROM poker_prize_pool WHERE tournament_id=$1 ORDER BY rank_from`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PrizeDistributionPool
	for rows.Next() {
		var p models.PrizeDistributionPool
		if err := rows.Scan(&p.ID, &p.TournamentID, &p.RankFrom, &p.RankTo, &p.PayoutBps, &p.GuaranteedMinor, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *TournamentStore) SetBalancingRule(ctx context.Context, r *models.MultiTableBalancingRule) error {
	r.ID = NewID("balrule")
	now := time.Now().UTC()
	r.CreatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_balance_rule (id,tournament_id,max_seat_difference,break_table_at_or_below,strategy,created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		r.ID, r.TournamentID, r.MaxSeatDifference, r.BreakTableAtOrBelow, r.Strategy, r.CreatedAt)
	return err
}

type TournamentPlayer struct {
	UserID   string
	Username string
	Stack    int64
	MatchID  string
	Status   string
}

func (s *TournamentStore) ListRegistered(ctx context.Context, tournamentID string) ([]TournamentPlayer, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id, username, stack, COALESCE(match_id,''), status
		FROM poker_tournament_registration WHERE tournament_id=$1 AND status IN ('registered','playing')`,
		tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TournamentPlayer
	for rows.Next() {
		var p TournamentPlayer
		if err := rows.Scan(&p.UserID, &p.Username, &p.Stack, &p.MatchID, &p.Status); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *TournamentStore) SetDirectorMatch(ctx context.Context, tournamentID, directorMatchID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament SET director_match_id=$2, status='running', current_level=1, level_started_at=NOW(), updated_at=NOW()
		WHERE id=$1`, tournamentID, directorMatchID)
	return err
}

func (s *TournamentStore) AddTableMatch(ctx context.Context, tournamentID, matchID string) error {
	id := NewID("ttbl")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_tournament_table (id, tournament_id, match_id, seated_count, created_at)
		VALUES ($1, $2, $3, 0, NOW())`, id, tournamentID, matchID)
	return err
}

func (s *TournamentStore) ListTableMatches(ctx context.Context, tournamentID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT match_id FROM poker_tournament_table WHERE tournament_id=$1`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *TournamentStore) AssignPlayerTable(ctx context.Context, tournamentID, userID, matchID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament_registration SET match_id=$3, status='playing', updated_at=NOW()
		WHERE tournament_id=$1 AND user_id=$2`, tournamentID, userID, matchID)
	return err
}

func (s *TournamentStore) MarkBusted(ctx context.Context, tournamentID, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament_registration SET status='busted', stack=0, updated_at=NOW()
		WHERE tournament_id=$1 AND user_id=$2 AND status='playing'`, tournamentID, userID)
	return err
}

func (s *TournamentStore) UpdatePlayerStack(ctx context.Context, tournamentID, userID string, stack int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament_registration SET stack=$3, updated_at=NOW()
		WHERE tournament_id=$1 AND user_id=$2`, tournamentID, userID, stack)
	return err
}

func (s *TournamentStore) CountPlaying(ctx context.Context, tournamentID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM poker_tournament_registration WHERE tournament_id=$1 AND status='playing'`, tournamentID).Scan(&n)
	return n, err
}

func (s *TournamentStore) GetRuntime(ctx context.Context, tournamentID string) (currentLevel int, levelStarted time.Time, err error) {
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(current_level,1), COALESCE(level_started_at,NOW())
		FROM poker_tournament WHERE id=$1`, tournamentID).Scan(&currentLevel, &levelStarted)
	return
}

func (s *TournamentStore) AdvanceLevel(ctx context.Context, tournamentID string, level int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament SET current_level=$2, level_started_at=NOW(), updated_at=NOW()
		WHERE id=$1`, tournamentID, level)
	return err
}

func (s *TournamentStore) Finish(ctx context.Context, tournamentID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_tournament SET status='finished', updated_at=NOW() WHERE id=$1`, tournamentID)
	return err
}

func (s *TournamentStore) GetBalancingRule(ctx context.Context, tournamentID string) (*models.MultiTableBalancingRule, error) {
	var r models.MultiTableBalancingRule
	err := s.db.QueryRowContext(ctx, `
		SELECT id,tournament_id,max_seat_difference,break_table_at_or_below,strategy,created_at
		FROM poker_balance_rule WHERE tournament_id=$1 ORDER BY created_at DESC LIMIT 1`, tournamentID).
		Scan(&r.ID, &r.TournamentID, &r.MaxSeatDifference, &r.BreakTableAtOrBelow, &r.Strategy, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return &models.MultiTableBalancingRule{MaxSeatDifference: 1, BreakTableAtOrBelow: 2, Strategy: "balanced"}, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *TournamentStore) PayWinner(ctx context.Context, tournamentID, userID string, amount int64) error {
	w := NewWalletStore(s.db)
	return w.Credit(ctx, userID, amount)
}
