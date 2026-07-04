package models

import "time"

// Global Tournament Matrix
//
// These models capture the persistence schema for network-wide multi-table
// tournaments (MTTs): the bracket/structure, table balancing rules, the blind
// level timer, and how the prize pool is split among finishers.

// TournamentBracket describes a single tournament instance and its structure.
type TournamentBracket struct {
	ID              string    `json:"id" db:"id"`
	Name            string    `json:"name" db:"name"`
	Variant         string    `json:"variant" db:"variant"` // e.g. "texas-holdem"
	BuyInMinor      int64     `json:"buy_in_minor" db:"buy_in_minor"`
	FeeMinor        int64     `json:"fee_minor" db:"fee_minor"`
	StartingStack   int64     `json:"starting_stack" db:"starting_stack"`
	MaxPlayers      int32     `json:"max_players" db:"max_players"`
	MaxSeatsPerTable int32    `json:"max_seats_per_table" db:"max_seats_per_table"`
	Status          string    `json:"status" db:"status"` // registering | running | finished
	ScheduledAt     time.Time `json:"scheduled_at" db:"scheduled_at"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// MultiTableBalancingRule controls how players are rebalanced across tables as
// a tournament progresses and tables break.
type MultiTableBalancingRule struct {
	ID                 string    `json:"id" db:"id"`
	TournamentID       string    `json:"tournament_id" db:"tournament_id"`
	MaxSeatDifference  int32     `json:"max_seat_difference" db:"max_seat_difference"`
	BreakTableAtOrBelow int32    `json:"break_table_at_or_below" db:"break_table_at_or_below"`
	Strategy           string    `json:"strategy" db:"strategy"` // "balanced" | "random"
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

// BlindTimer represents a single blind level within a tournament structure.
type BlindTimer struct {
	ID           string    `json:"id" db:"id"`
	TournamentID string    `json:"tournament_id" db:"tournament_id"`
	Level        int32     `json:"level" db:"level"`
	SmallBlind   int64     `json:"small_blind" db:"small_blind"`
	BigBlind     int64     `json:"big_blind" db:"big_blind"`
	Ante         int64     `json:"ante" db:"ante"`
	DurationSecs int32     `json:"duration_secs" db:"duration_secs"`
	IsBreak      bool      `json:"is_break" db:"is_break"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// PrizeDistributionPool describes a single payout tier for a tournament.
type PrizeDistributionPool struct {
	ID              string    `json:"id" db:"id"`
	TournamentID    string    `json:"tournament_id" db:"tournament_id"`
	RankFrom        int32     `json:"rank_from" db:"rank_from"`
	RankTo          int32     `json:"rank_to" db:"rank_to"`
	PayoutBps       int32     `json:"payout_bps" db:"payout_bps"` // share of pool in basis points
	GuaranteedMinor int64     `json:"guaranteed_minor" db:"guaranteed_minor"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}
