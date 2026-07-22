package apischema

import (
	"reflect"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
)

// Entry binds a registered RPC id to the exact request struct its handler
// decodes, plus a valid example form payload (input fields only — no
// server-controlled fields). The example is what the frontend prefills.
type Entry struct {
	RPC     string
	Type    reflect.Type
	Example map[string]interface{}
}

// Registry is the source-of-truth list for the Command Center form cluster:
// every RPC that a human fills in a form for. Each Type is the same struct the
// handler in package rpc unmarshals the payload into, so a generated schema can
// never drift from what the backend accepts.
//
// Adding a form RPC = add one row here (and annotate its struct once).
var Registry = []Entry{
	// Community & Clubs — the section the UI review flagged hardest.
	{
		RPC:  "club_create",
		Type: reflect.TypeOf(models.Club{}),
		Example: map[string]interface{}{
			"name":        "Midnight Hold'em Society",
			"description": "Invite-only high stakes club",
			"currency":    "USD",
		},
	},
	{
		RPC:  "club_owner_add",
		Type: reflect.TypeOf(models.Owner{}),
		Example: map[string]interface{}{
			"club_id":    "",
			"user_id":    "",
			"role":       "manager",
			"equity_bps": 2500,
		},
	},
	{
		RPC:  "club_member_role",
		Type: reflect.TypeOf(protocol.ClubMemberRoleRequest{}),
		Example: map[string]interface{}{
			"club_id": "",
			"user_id": "",
			"role":    "admin",
		},
	},
	{
		RPC:  "balance_allocate",
		Type: reflect.TypeOf(models.PlayerAllocatedBalance{}),
		Example: map[string]interface{}{
			"club_id":  "",
			"user_id":  "",
			"balance":  100000,
			"currency": "USD",
		},
	},
	{
		RPC:  "rake_config_set",
		Type: reflect.TypeOf(models.CustomRakeConfiguration{}),
		Example: map[string]interface{}{
			"club_id":       "",
			"name":          "Standard",
			"percent_bps":   500,
			"cap_minor":     300,
			"min_pot_minor": 0,
			"public":        false,
		},
	},

	// Cash game.
	{
		RPC:  "table_create",
		Type: reflect.TypeOf(protocol.TableCreateRequest{}),
		Example: map[string]interface{}{
			"name":        "High Rollers",
			"small_blind": 100,
			"big_blind":   200,
			"buy_in":      100000,
			"max_seats":   6,
			"min_players": 2,
			"num_bots":    5,
			"variant":     "holdem",
		},
	},

	// Tournaments.
	{
		RPC:  "tournament_create",
		Type: reflect.TypeOf(models.TournamentBracket{}),
		Example: map[string]interface{}{
			"name":                "Friday Night 100",
			"variant":             "texas-holdem",
			"buy_in_minor":        10000,
			"fee_minor":           1000,
			"starting_stack":      10000,
			"max_players":         180,
			"max_seats_per_table": 6,
		},
	},
	{
		RPC:  "blind_level_add",
		Type: reflect.TypeOf(models.BlindTimer{}),
		Example: map[string]interface{}{
			"tournament_id": "",
			"level":         1,
			"small_blind":   50,
			"big_blind":     100,
			"ante":          0,
			"duration_secs": 600,
		},
	},
	{
		RPC:  "prize_pool_add",
		Type: reflect.TypeOf(models.PrizeDistributionPool{}),
		Example: map[string]interface{}{
			"tournament_id": "",
			"rank_from":     1,
			"rank_to":       1,
			"payout_bps":    5000,
		},
	},
	{
		RPC:  "balancing_rule_set",
		Type: reflect.TypeOf(models.MultiTableBalancingRule{}),
		Example: map[string]interface{}{
			"tournament_id":          "",
			"max_seat_difference":    1,
			"break_table_at_or_below": 2,
			"strategy":               "balanced",
		},
	},
}

// Build reflects every registry entry into its input JSON Schema, keyed by RPC.
func Build() map[string]*Schema {
	out := make(map[string]*Schema, len(Registry))
	for _, e := range Registry {
		out[e.RPC] = ReflectRequest(e.RPC, e.Type, e.Example)
	}
	return out
}
