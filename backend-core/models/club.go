package models

import "time"

// Private Club Systems
//
// These models capture the persistence schema for operator-run private poker
// clubs: the club itself, its owners, per-player balances allocated within a
// club, and the club's bespoke rake (commission) rules.

// Club is a privately operated poker room hosted on the network.
type Club struct {
	ID          string    `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Slug        string    `json:"slug" db:"slug"`
	Description string    `json:"description" db:"description"`
	Currency    string    `json:"currency" db:"currency"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Owner is a user with an ownership/management stake in a Club.
type Owner struct {
	ID           string    `json:"id" db:"id"`
	ClubID       string    `json:"club_id" db:"club_id"`
	UserID       string    `json:"user_id" db:"user_id"`
	Role         string    `json:"role" db:"role"` // owner | manager | agent
	EquityBps    int32     `json:"equity_bps" db:"equity_bps"`
	CanConfigure bool      `json:"can_configure" db:"can_configure"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// PlayerAllocatedBalance tracks the chips/credits a player holds inside a Club.
type PlayerAllocatedBalance struct {
	ID           string    `json:"id" db:"id"`
	ClubID       string    `json:"club_id" db:"club_id"`
	UserID       string    `json:"user_id" db:"user_id"`
	Balance      int64     `json:"balance" db:"balance"`             // minor units
	LockedAmount int64     `json:"locked_amount" db:"locked_amount"` // in active pots
	Currency     string    `json:"currency" db:"currency"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// CustomRakeConfiguration defines a Club's rake (house commission) policy.
type CustomRakeConfiguration struct {
	ID          string    `json:"id" db:"id"`
	ClubID      string    `json:"club_id" db:"club_id"`
	Name        string    `json:"name" db:"name"`
	PercentBps  int32     `json:"percent_bps" db:"percent_bps"`   // rake as basis points
	CapMinor    int64     `json:"cap_minor" db:"cap_minor"`       // max rake per pot
	NoFlopNoDrop bool     `json:"no_flop_no_drop" db:"no_flop_no_drop"`
	MinPotMinor int64     `json:"min_pot_minor" db:"min_pot_minor"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}
