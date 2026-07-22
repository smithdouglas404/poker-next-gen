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
