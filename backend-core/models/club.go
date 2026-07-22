package models

import "time"

// Private Club Systems
//
// These models capture the persistence schema for operator-run private poker
// clubs: the club itself, its owners, per-player balances allocated within a
// club, and the club's bespoke rake (commission) rules.

// Club is a privately operated poker room hosted on the network.
//
// Form-metadata tags (validate/enum/unit/label/help/server/ref) make this the
// single source of truth for the club_create form; cmd/schemagen reflects them
// into schemas/rpc/*.json for the frontend renderer. They are additive metadata
// only — persistence and JSON marshaling are unchanged.
type Club struct {
	ID          string    `json:"id" db:"id" server:"true"`
	Name        string    `json:"name" db:"name" validate:"required,minlen=2,maxlen=64" label:"Club Name"`
	Slug        string    `json:"slug" db:"slug" server:"true" help:"Auto-derived from the name when omitted."`
	Description string    `json:"description" db:"description" validate:"maxlen=280" label:"Description"`
	Currency    string    `json:"currency" db:"currency" enum:"USD,EUR,GBP,CAD,AUD" label:"Currency" help:"Defaults to USD."`
	// AcceptsGlobalWallet: when true, players may buy in with their funded global
	// wallet at this club's tables (in addition to the club-issued balance). When
	// false, only the club-issued wallet is accepted.
	AcceptsGlobalWallet bool `json:"accepts_global_wallet" db:"accepts_global_wallet" label:"Accept Global Wallet" help:"Let players buy in with their funded global wallet, not just club chips."`
	IsActive    bool      `json:"is_active" db:"is_active" server:"true"`
	CreatedAt   time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// Owner is a user with an ownership/management stake in a Club.
type Owner struct {
	ID           string    `json:"id" db:"id" server:"true"`
	ClubID       string    `json:"club_id" db:"club_id" validate:"required" ref:"club" label:"Club"`
	UserID       string    `json:"user_id" db:"user_id" validate:"required" ref:"user" label:"User"`
	Role         string    `json:"role" db:"role" enum:"owner,manager,agent" label:"Role"` // owner | manager | agent
	EquityBps    int32     `json:"equity_bps" db:"equity_bps" validate:"min=0,max=10000" unit:"bps" label:"Equity"`
	CanConfigure bool      `json:"can_configure" db:"can_configure" label:"Can Configure"`
	CreatedAt    time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// PlayerAllocatedBalance tracks the chips/credits a player holds inside a Club.
type PlayerAllocatedBalance struct {
	ID           string    `json:"id" db:"id" server:"true"`
	ClubID       string    `json:"club_id" db:"club_id" validate:"required" ref:"club" label:"Club"`
	UserID       string    `json:"user_id" db:"user_id" validate:"required" ref:"user" label:"Player"`
	Balance      int64     `json:"balance" db:"balance" validate:"required,min=1" unit:"money_minor" label:"Amount"`             // minor units
	LockedAmount int64     `json:"locked_amount" db:"locked_amount" server:"true"` // in active pots
	Currency     string    `json:"currency" db:"currency" enum:"USD,EUR,GBP,CAD,AUD" label:"Currency" help:"Defaults to USD."`
	CreatedAt    time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at" server:"true"`
}

// CustomRakeConfiguration defines a Club's rake (house commission) policy.
type CustomRakeConfiguration struct {
	ID          string    `json:"id" db:"id" server:"true"`
	ClubID      string    `json:"club_id" db:"club_id" validate:"required" ref:"club" label:"Club"`
	Name        string    `json:"name" db:"name" validate:"maxlen=64" label:"Config Name" help:"Defaults to \"Standard\"."`
	PercentBps  int32     `json:"percent_bps" db:"percent_bps" validate:"min=0,max=1000" unit:"bps" label:"Rake"`   // rake as basis points (capped 10%)
	CapMinor    int64     `json:"cap_minor" db:"cap_minor" validate:"min=0" unit:"money_minor" label:"Rake Cap"`       // max rake per pot
	NoFlopNoDrop bool     `json:"no_flop_no_drop" db:"no_flop_no_drop" label:"No Flop, No Drop"`
	MinPotMinor int64     `json:"min_pot_minor" db:"min_pot_minor" validate:"min=0" unit:"money_minor" label:"Minimum Pot"`
	IsActive    bool      `json:"is_active" db:"is_active" server:"true"`
	// Public: when the club owner opts in, the rake config is readable by anyone
	// (a transparency signal). Default false — otherwise it is club-members-only.
	Public      bool      `json:"public" db:"is_public" label:"Publicly Visible" help:"Opt in to make this rake rule readable by anyone."`
	CreatedAt   time.Time `json:"created_at" db:"created_at" server:"true"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at" server:"true"`
}
