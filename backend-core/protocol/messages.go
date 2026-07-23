package protocol

// Wire messages shared between server and clients.

type SitDownRequest struct {
	Seat   int   `json:"seat"`
	BuyIn  int64 `json:"buy_in"`
	// Wallet the buy-in draws from at a club table that accepts both: "global"
	// (funded global wallet) or "club" (club-issued balance). Empty => club
	// balance at a club table, global wallet at a non-club table (the old default).
	Wallet string `json:"wallet,omitempty"`
}

type ActionRequest struct {
	Type   string `json:"type"`
	Amount int64  `json:"amount"`
}

type CardView struct {
	Code   string `json:"code"`
	FaceUp bool   `json:"face_up"`
}

type SeatView struct {
	Index    int    `json:"index"`
	UserID   string `json:"user_id,omitempty"`
	Username string `json:"username,omitempty"`
	Stack    int64  `json:"stack"`
	Status   string `json:"status"` // empty | seated | folded | all_in
	LastAction string `json:"last_action,omitempty"`
	IsHero   bool   `json:"is_hero,omitempty"`
	ModelURL string `json:"model_url,omitempty"` // equipped 3D character GLB
}

type PotView struct {
	Amount int64 `json:"amount"`
}

type TableSnapshot struct {
	MatchID      string     `json:"match_id"`
	RoomID       string     `json:"room_id"`
	Phase        string     `json:"phase"` // waiting | preflop | flop | turn | river | showdown
	Seats        []SeatView `json:"seats"`
	Board        []CardView `json:"board"`
	Pot          int64      `json:"pot"`
	CurrentBet   int64      `json:"current_bet"`
	ActionSeat   int         `json:"action_seat"`
	ButtonSeat   int         `json:"button_seat"`
	SmallBlind   int64      `json:"small_blind"`
	BigBlind     int64      `json:"big_blind"`
	MaxSeats     int        `json:"max_seats"`
	HeroWallet   int64      `json:"hero_wallet_cents"`
	// Buy-in band + wallet options so the client can render a real buy-in dialog.
	MinBuyIn            int64 `json:"min_buy_in"`
	MaxBuyIn            int64 `json:"max_buy_in"`
	AcceptsGlobalWallet bool  `json:"accepts_global_wallet"`
	HeroClubBalance     int64 `json:"hero_club_balance,omitempty"` // available club-issued balance (club tables)
	HandNo         int         `json:"hand_no"`
	DeckCommitHash string      `json:"deck_commit_hash,omitempty"`
	Variant        string      `json:"variant,omitempty"` // "holdem" | "plo"
	HostUserID     string      `json:"host_user_id,omitempty"`
	HostPaused     bool        `json:"host_paused,omitempty"`
	// Optional table-feature capabilities (#41) so the client only shows controls
	// that bind to a live, enabled RPC path.
	AllowStraddle   bool `json:"allow_straddle,omitempty"`
	AllowBombPot    bool `json:"allow_bomb_pot,omitempty"`
	AllowInsurance  bool `json:"allow_insurance,omitempty"`
	AllowRunItTwice bool `json:"allow_run_it_twice,omitempty"`
	StraddleArmed   bool `json:"straddle_armed,omitempty"`
}

type DealPrivateMessage struct {
	Seat  int        `json:"seat"`
	Cards []CardView `json:"cards,omitempty"`
	// Enc, when set, is base64(nonce || AES-256-GCM ciphertext) of the JSON
	// {"cards":[...]} encrypted with the recipient's per-session key. The raw
	// WebSocket frame then carries no plaintext card identities.
	Enc string `json:"enc,omitempty"`
}

// SessionKeyMessage delivers a player's per-session AES key (base64) used to
// decrypt their own hole cards. Sent only to that player on join.
type SessionKeyMessage struct {
	Key string `json:"key"`
}

type ActionRequiredMessage struct {
	Seat         int      `json:"seat"`
	ValidActions []string `json:"valid_actions"`
	ToCall       int64    `json:"to_call"`
	MinRaise     int64    `json:"min_raise"`
	MaxRaise     int64    `json:"max_raise"`
	Pot          int64    `json:"pot"`
	DeadlineTick int64    `json:"deadline_tick"`
	// Server-authoritative shot clock: ActionSecs is the base time to act; when
	// it lapses the server burns TimeBankSecs (the player's remaining time bank)
	// before auto-folding. The client renders these instead of a hardcoded clock.
	ActionSecs   int      `json:"action_secs"`
	TimeBankSecs int      `json:"time_bank_secs"`
}

type ErrorMessage struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ChatSendRequest is a client → server chat message (OpChatSend).
type ChatSendRequest struct {
	Text string `json:"text"`
}

// ChatMessage is a server → client chat/play-by-play line (OpChat). Kind is
// "player" for a seated player's message or "dealer" for auto play-by-play.
type ChatMessage struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Text     string `json:"text"`
	Kind     string `json:"kind"`
	Seat     int    `json:"seat"`
	HandNo   int    `json:"hand_no"`
}

type TableCreateRequest struct {
	Name       string `json:"name" label:"Table Name" help:"Optional; a name is generated if omitted."`
	ClubID     string `json:"club_id,omitempty" ref:"club" label:"Club" help:"Bind to a club: buy-ins draw the club-allocated balance and pots are raked to the club."`
	SmallBlind int64  `json:"small_blind" validate:"min=0" unit:"money_minor" label:"Small Blind"`
	BigBlind   int64  `json:"big_blind" validate:"min=0" unit:"money_minor" label:"Big Blind"`
	BuyIn      int64  `json:"buy_in" validate:"min=0" unit:"money_minor" label:"Default Buy-in"`
	MinBuyIn   int64  `json:"min_buy_in" validate:"min=0" unit:"money_minor" label:"Minimum Buy-in"`
	MaxBuyIn   int64  `json:"max_buy_in" validate:"min=0" unit:"money_minor" label:"Maximum Buy-in"`
	MaxSeats   int    `json:"max_seats" validate:"min=2,max=10" unit:"count" label:"Seats at the table"`
	MinPlayers int    `json:"min_players" validate:"min=2,max=10" unit:"count" label:"Players needed to start"`
	NumBots    int    `json:"num_bots" validate:"min=0,max=9" unit:"count" label:"Bots"`
	Variant    string `json:"variant" enum:"holdem,plo" label:"Variant"`       // "holdem" | "plo"; empty => holdem
	DurationMins int  `json:"duration_mins" validate:"min=0,max=720" unit:"minutes" label:"Auto-close (minutes)"` // auto-close after N minutes (0 = no limit)
	// Optional table features (#41); all default-off so a plain table is unchanged.
	AllowStraddle   bool  `json:"allow_straddle,omitempty" label:"Allow Straddle"`
	AllowBombPot    bool  `json:"allow_bomb_pot,omitempty" label:"Allow Bomb Pot"`
	BombPotAnte     int64 `json:"bomb_pot_ante,omitempty" validate:"min=0" unit:"money_minor" label:"Bomb Pot Ante"` // per-player ante (0 => one BB when triggered)
	AllowInsurance  bool  `json:"allow_insurance,omitempty" label:"Allow Insurance"`
	AllowRunItTwice bool  `json:"allow_run_it_twice,omitempty" label:"Allow Run It Twice"`
}

// ClubMemberRoleRequest is the club_member_role RPC payload: promote/demote a
// member between the member and admin roles. Named (not anonymous) so the schema
// generator can reflect it as the single source of truth for the form.
type ClubMemberRoleRequest struct {
	ClubID string `json:"club_id" validate:"required" ref:"club" label:"Club"`
	UserID string `json:"user_id" validate:"required" ref:"user" label:"Member"`
	Role   string `json:"role" validate:"required" enum:"member,admin" label:"Role"`
}

// PostStraddleRequest arms (or disarms) a voluntary straddle for the next hand.
type PostStraddleRequest struct {
	Enable bool `json:"enable"`
}

// RunItTwiceVote is a player's agreement (or withdrawal) to run the board twice
// when they are all-in.
type RunItTwiceVote struct {
	Agree bool `json:"agree"`
}

// InsuranceOfferMessage (server → the all-in player) prices insurance off the
// player's live equity: pay Premium now, receive Payout if the hand is lost.
type InsuranceOfferMessage struct {
	Seat    int     `json:"seat"`
	HandNo  int     `json:"hand_no"`
	Premium int64   `json:"premium"`
	Payout  int64   `json:"payout"`
	Equity  float64 `json:"equity"`
}

// InsuranceAcceptRequest (client → server) accepts the standing offer for the hand.
type InsuranceAcceptRequest struct {
	HandNo int `json:"hand_no"`
}

type TableCreateResponse struct {
	MatchID string `json:"match_id"`
	RoomID  string `json:"room_id"`
	Label   string `json:"label"`
	Code    string `json:"code,omitempty"` // short shareable room code
}

type TableListResponse struct {
	Matches []TableListItem `json:"matches"`
}

type TableListItem struct {
	MatchID   string `json:"match_id"`
	RoomID    string `json:"room_id"`
	Label     string `json:"label"`
	Seated    int    `json:"seated"`
	OpenSeats int    `json:"open_seats"`
}
