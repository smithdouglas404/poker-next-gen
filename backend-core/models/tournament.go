package models

import "time"

// Global Tournament Matrix
//
// These models capture the persistence schema for network-wide multi-table
// tournaments (MTTs): the bracket/structure, table balancing rules, the blind
// level timer, and how the prize pool is split among finishers.

// TournamentBracket describes a single tournament instance and its structure.
type TournamentBracket struct {
	ID              string    `json:"id" db:"id" server:"true"`
	Name            string    `json:"name" db:"name" validate:"required,minlen=2,maxlen=80" label:"Tournament Name"`
	// ClubID owns the tournament (empty = a platform tournament); CreatedBy is the
	// creator's user id. Both drive authorization for start/structure mutations —
	// only the creator or a configurer of the owning club may edit or start it.
	ClubID          string    `json:"club_id" db:"club_id" ref:"club" label:"Club" help:"Leave empty for a platform tournament."`
	CreatedBy       string    `json:"created_by" db:"created_by" server:"true"`
	Variant         string    `json:"variant" db:"variant" enum:"texas-holdem,omaha" label:"Variant"` // e.g. "texas-holdem"
	BuyInMinor      int64     `json:"buy_in_minor" db:"buy_in_minor" validate:"min=0" unit:"money_minor" label:"Buy-in"`
	FeeMinor        int64     `json:"fee_minor" db:"fee_minor" validate:"min=0" unit:"money_minor" label:"Entry Fee"`
	StartingStack   int64     `json:"starting_stack" db:"starting_stack" validate:"min=0" unit:"count" label:"Starting Stack"`
	MaxPlayers      int32     `json:"max_players" db:"max_players" validate:"min=2,max=10000" unit:"count" label:"Max Players"`
	MaxSeatsPerTable int32    `json:"max_seats_per_table" db:"max_seats_per_table" validate:"min=2,max=10" unit:"count" label:"Seats per Table"`
	// Knockout (PKO): when true, BountyMinor of each buy-in becomes that player's
	// head bounty, won by whoever eliminates them.
	Knockout        bool      `json:"knockout" db:"knockout" label:"Knockout (Bounty)" help:"Eliminating a player wins their bounty."`
	BountyMinor     int64     `json:"bounty_minor" db:"bounty_minor" validate:"min=0" unit:"money_minor" label:"Per-Player Bounty"`
	// AdminFeeBps is the club's percentage cut of each buy-in, charged alongside
	// the flat FeeMinor. Like FeeMinor it comes OUT of the buy-in rather than on
	// top of it — the advertised entry price is what the player pays, and the
	// prize pool is what is left. See store.TournamentEconomics.
	AdminFeeBps     int32     `json:"admin_fee_bps" db:"admin_fee_bps" validate:"min=0,max=10000" unit:"bps" label:"Admin Fee" help:"Club's percentage of each buy-in, on top of the flat entry fee."`
	// GuaranteeMinor is a guaranteed prize pool. If entries fall short the club
	// covers the shortfall (the overlay); it never reduces a pool that exceeds it.
	GuaranteeMinor  int64     `json:"guarantee_minor" db:"guarantee_minor" validate:"min=0" unit:"money_minor" label:"Guaranteed Prize Pool"`
	// OperatingStartMin / OperatingEndMin bound registration to a daily window,
	// in minutes past midnight UTC. Equal values mean no window. Start > End is a
	// window that wraps midnight (18:00–04:00 => 1080, 240).
	OperatingStartMin int32   `json:"operating_start_min" db:"operating_start_min" validate:"min=0,max=1439" unit:"count" label:"Operating Hours Start"`
	OperatingEndMin   int32   `json:"operating_end_min" db:"operating_end_min" validate:"min=0,max=1439" unit:"count" label:"Operating Hours End"`
	// AutoAwayOnTimeout sits a player out after two consecutive decision timeouts.
	// Tournament-scoped; applied to every table this tournament starts.
	AutoAwayOnTimeout bool    `json:"auto_away_on_timeout" db:"auto_away_on_timeout" label:"Auto-Away on 2× Timeout"`
	// TimeBankPerHandSecs tops the bank up each hand; TimeBankSecs is the total.
	TimeBankPerHandSecs int32 `json:"time_bank_per_hand_secs" db:"time_bank_per_hand_secs" validate:"min=0,max=120" unit:"seconds" label:"Time Bank per Hand"`
	// LateRegSecs is how long after the scheduled start registration stays open.
	// Enforced by TournamentRegister — 0 closes registration at the start time.
	LateRegSecs     int32     `json:"late_reg_secs" db:"late_reg_secs" validate:"min=0" unit:"seconds" label:"Late Registration Window"`
	// TimeBankSecs is each player's total banked seconds, passed to the tables.
	TimeBankSecs    int32     `json:"time_bank_secs" db:"time_bank_secs" validate:"min=0,max=600" unit:"seconds" label:"Time Bank (total)"`
	Status          string    `json:"status" db:"status" server:"true"` // registering | running | finished
	ScheduledAt     time.Time `json:"scheduled_at" db:"scheduled_at" label:"Scheduled Start" help:"Defaults to now."`
	CreatedAt       time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// MultiTableBalancingRule controls how players are rebalanced across tables as
// a tournament progresses and tables break.
type MultiTableBalancingRule struct {
	ID                 string    `json:"id" db:"id" server:"true"`
	TournamentID       string    `json:"tournament_id" db:"tournament_id" validate:"required" ref:"tournament" label:"Tournament"`
	MaxSeatDifference  int32     `json:"max_seat_difference" db:"max_seat_difference" validate:"min=1,max=9" unit:"count" label:"Max Seat Difference"`
	BreakTableAtOrBelow int32    `json:"break_table_at_or_below" db:"break_table_at_or_below" validate:"min=1,max=9" unit:"count" label:"Break Table At or Below"`
	Strategy           string    `json:"strategy" db:"strategy" enum:"balanced,random" label:"Strategy"` // "balanced" | "random"
	CreatedAt          time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// BlindTimer represents a single blind level within a tournament structure.
type BlindTimer struct {
	ID           string    `json:"id" db:"id" server:"true"`
	TournamentID string    `json:"tournament_id" db:"tournament_id" validate:"required" ref:"tournament" label:"Tournament"`
	Level        int32     `json:"level" db:"level" validate:"required,min=1" unit:"count" label:"Level"`
	SmallBlind   int64     `json:"small_blind" db:"small_blind" validate:"min=0" unit:"money_minor" label:"Small Blind"`
	BigBlind     int64     `json:"big_blind" db:"big_blind" validate:"min=0" unit:"money_minor" label:"Big Blind"`
	Ante         int64     `json:"ante" db:"ante" validate:"min=0" unit:"money_minor" label:"Ante"`
	DurationSecs int32     `json:"duration_secs" db:"duration_secs" validate:"min=0" unit:"seconds" label:"Duration"`
	IsBreak      bool      `json:"is_break" db:"is_break" label:"Is Break"`
	CreatedAt    time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// PrizeDistributionPool describes a single payout tier for a tournament.
type PrizeDistributionPool struct {
	ID              string    `json:"id" db:"id" server:"true"`
	TournamentID    string    `json:"tournament_id" db:"tournament_id" validate:"required" ref:"tournament" label:"Tournament"`
	RankFrom        int32     `json:"rank_from" db:"rank_from" validate:"required,min=1" unit:"count" label:"Rank From"`
	RankTo          int32     `json:"rank_to" db:"rank_to" validate:"required,min=1" unit:"count" label:"Rank To"`
	PayoutBps       int32     `json:"payout_bps" db:"payout_bps" validate:"required,min=0,max=10000" unit:"bps" label:"Payout"` // share of pool in basis points
	GuaranteedMinor int64     `json:"guaranteed_minor" db:"guaranteed_minor" validate:"min=0" unit:"money_minor" label:"Guaranteed Minimum"`
	CreatedAt       time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at" server:"true"`
}
