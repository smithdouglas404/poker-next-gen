package protocol

// Wire messages shared between server and clients.

type SitDownRequest struct {
	Seat  int   `json:"seat"`
	BuyIn int64 `json:"buy_in"`
	// Wallet the buy-in draws from at a club table that accepts both: "global"
	// (funded global wallet) or "club" (club-issued balance). Empty => club
	// balance at a club table, global wallet at a non-club table (the old default).
	Wallet string `json:"wallet,omitempty"`
	// PostNow: when joining a game already in progress, post the blinds immediately
	// (a dead small blind + a live big blind) to be dealt in on the next hand,
	// rather than waiting for the big blind to reach the seat. False => wait.
	PostNow bool `json:"post_now,omitempty"`
}

// MoveSeatRequest asks to relocate the caller to an empty seat (player self-move,
// between hands, chip-conserving).
type MoveSeatRequest struct {
	ToSeat int `json:"to_seat"`
}

// SitOutRequest toggles the caller sitting out in place (keeps their seat + chips).
type SitOutRequest struct {
	SitOut bool `json:"sit_out"`
}

type ActionRequest struct {
	Type   string `json:"type"`
	Amount int64  `json:"amount"`
	// Nonce optionally dedupes a re-sent action (client retry / double-tap). When
	// present and equal to the last nonce the server accepted from this player, the
	// action is a no-op. Empty => no dedup (backward-compatible with old clients).
	Nonce string `json:"nonce,omitempty"`
}

type CardView struct {
	Code   string `json:"code"`
	FaceUp bool   `json:"face_up"`
}

type SeatView struct {
	Index      int    `json:"index"`
	UserID     string `json:"user_id,omitempty"`
	Username   string `json:"username,omitempty"`
	Stack      int64  `json:"stack"`
	Status     string `json:"status"` // empty | seated | folded | all_in
	LastAction string `json:"last_action,omitempty"`
	IsHero     bool   `json:"is_hero,omitempty"`
	IsBot      bool   `json:"is_bot,omitempty"`    // AI seat — always disclosed to every player
	ModelURL   string `json:"model_url,omitempty"` // equipped 3D character GLB
	// Bet is the player's contribution on the current street (chips in front of
	// the seat), 0 when they haven't acted this street.
	Bet int64 `json:"bet,omitempty"`
	// SittingOut: the player kept their seat but is out of the game (not dealt in);
	// OwesPost: they must post to return before their natural big blind.
	SittingOut bool `json:"sitting_out,omitempty"`
	OwesPost   bool `json:"owes_post,omitempty"`
}

type PotView struct {
	Amount int64 `json:"amount"`
}

type TableSnapshot struct {
	MatchID    string     `json:"match_id"`
	RoomID     string     `json:"room_id"`
	Phase      string     `json:"phase"` // waiting | preflop | flop | turn | river | showdown
	Seats      []SeatView `json:"seats"`
	Board      []CardView `json:"board"`
	Pot        int64      `json:"pot"`
	CurrentBet int64      `json:"current_bet"`
	ActionSeat int        `json:"action_seat"`
	ButtonSeat int        `json:"button_seat"`
	SmallBlind int64      `json:"small_blind"`
	BigBlind   int64      `json:"big_blind"`
	MaxSeats   int        `json:"max_seats"`
	HeroWallet int64      `json:"hero_wallet_cents"`
	// Buy-in band + wallet options so the client can render a real buy-in dialog.
	MinBuyIn            int64  `json:"min_buy_in"`
	MaxBuyIn            int64  `json:"max_buy_in"`
	AcceptsGlobalWallet bool   `json:"accepts_global_wallet"`
	HeroClubBalance     int64  `json:"hero_club_balance,omitempty"` // available club-issued balance (club tables)
	HandNo              int    `json:"hand_no"`
	DeckCommitHash      string `json:"deck_commit_hash,omitempty"`
	Variant             string `json:"variant,omitempty"` // "holdem" | "plo"
	// RenderStyle is the owner-chosen table look ("2.5d" | "3d") — every seat at the
	// table renders in this style; empty falls back to the player's device preference.
	RenderStyle string `json:"render_style,omitempty"`
	// TableArt is the owner-chosen baked table plate id (see frontend bakedTable.ts);
	// empty falls back to the default cinematic felt.
	TableArt   string `json:"table_art,omitempty"`
	HostUserID string `json:"host_user_id,omitempty"`
	HostPaused bool   `json:"host_paused,omitempty"`
	// AIHostEnabled reflects real match state (MatchState.AIHostEnabled) — the
	// client renders the toggle from this, never a local optimistic guess, so
	// it can never drift from what the server actually did.
	AIHostEnabled bool `json:"ai_host_enabled,omitempty"`
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
	ActionSecs   int `json:"action_secs"`
	TimeBankSecs int `json:"time_bank_secs"`
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
	Name         string `json:"name" label:"Table Name" help:"Optional; a name is generated if omitted."`
	ClubID       string `json:"club_id,omitempty" ref:"club" label:"Club" help:"Bind to a club: buy-ins draw the club-allocated balance and pots are raked to the club."`
	SmallBlind   int64  `json:"small_blind" validate:"min=0" unit:"money_minor" label:"Small Blind"`
	BigBlind     int64  `json:"big_blind" validate:"min=0" unit:"money_minor" label:"Big Blind"`
	BuyIn        int64  `json:"buy_in" validate:"min=0" unit:"money_minor" label:"Default Buy-in"`
	MinBuyIn     int64  `json:"min_buy_in" validate:"min=0" unit:"money_minor" label:"Minimum Buy-in"`
	MaxBuyIn     int64  `json:"max_buy_in" validate:"min=0" unit:"money_minor" label:"Maximum Buy-in"`
	MaxSeats     int    `json:"max_seats" validate:"min=2,max=10" unit:"count" label:"Seats at the table"`
	MinPlayers   int    `json:"min_players" validate:"min=2,max=10" unit:"count" label:"Players needed to start"`
	NumBots      int    `json:"num_bots" validate:"min=0,max=9" unit:"count" label:"Bots"`
	Variant      string `json:"variant" enum:"holdem,plo" label:"Variant"`                                          // "holdem" | "plo"; empty => holdem
	DurationMins int    `json:"duration_mins" validate:"min=0,max=720" unit:"minutes" label:"Auto-close (minutes)"` // auto-close after N minutes (0 = no limit)
	// Shot clock: per-table action seconds + per-player time bank. 0 => server
	// defaults (30s clock, 30s bank).
	ActionSecs   int `json:"action_secs,omitempty" validate:"min=0,max=120" unit:"seconds" label:"Shot clock (seconds)"`
	TimeBankSecs int `json:"time_bank_secs,omitempty" validate:"min=0,max=120" unit:"seconds" label:"Time bank (seconds)"`
	// Optional table features (#41); all default-off so a plain table is unchanged.
	AllowStraddle   bool  `json:"allow_straddle,omitempty" label:"Allow Straddle"`
	AllowBombPot    bool  `json:"allow_bomb_pot,omitempty" label:"Allow Bomb Pot"`
	BombPotAnte     int64 `json:"bomb_pot_ante,omitempty" validate:"min=0" unit:"money_minor" label:"Bomb Pot Ante"` // per-player ante (0 => one BB when triggered)
	AllowInsurance  bool  `json:"allow_insurance,omitempty" label:"Allow Insurance"`
	AllowRunItTwice bool  `json:"allow_run_it_twice,omitempty" label:"Allow Run It Twice"`
	// Competition tags: bind the table to a club-war / league so settled hands
	// accrue to those standings (empty => not participating).
	WarID    string `json:"war_id,omitempty" label:"Club War"`
	LeagueID string `json:"league_id,omitempty" label:"League"`
	// Access & seating policy (#83). Previously the rich setup form sent these keys
	// but the backend dropped them ("faces without flows"). Now first-class:
	//  - AccessType "public" | "members" | "invite" (empty => public). "members"
	//    requires club membership to sit; "invite" requires a matching JoinCode.
	//  - AllowSpectators: when false, only seated players receive table state.
	//  - KYCRequired: table-level KYC floor (in addition to the platform floor).
	//  - GeoRestricted: re-check the seating player's jurisdiction at sit-down.
	//  - WalletLimitCents: cap total chips a single player may bring to the table.
	//  - AutoBuyBackCents: auto top-up a busted player to this stack (0 => off).
	AccessType       string `json:"access_type,omitempty" enum:"public,members,invite" label:"Access Type"`
	JoinCode         string `json:"join_code,omitempty" label:"Table Join Code"`
	AllowSpectators  bool   `json:"allow_spectators,omitempty" label:"Allow Spectators"`
	// Opt out of the coded-guest approval gate: anyone holding this table's
	// code may sit immediately, no operator decision. Default FALSE — a home
	// game turns it on so friends are not queued; a public coded table leaves
	// it off so strangers are not seated unseen.
	TrustCodeGuests  bool   `json:"trust_code_guests,omitempty" label:"Trust Code Holders"`
	KYCRequired      bool   `json:"kyc_required,omitempty" label:"Require KYC to sit"`
	GeoRestricted    bool   `json:"geo_restricted,omitempty" label:"Geo-Restricted"`
	WalletLimitCents int64  `json:"wallet_limit_cents,omitempty" validate:"min=0" unit:"money_minor" label:"Universal Wallet Limit"`
	AutoBuyBackCents int64  `json:"auto_buy_back_cents,omitempty" validate:"min=0" unit:"money_minor" label:"Auto Buy-Back"`
	//  - NoMaxBuyIn: unlimited buy-in (no max) — honored on PLAY-MONEY tables only.
	NoMaxBuyIn bool `json:"no_max_buyin,omitempty" label:"Unlimited buy-in (play money)"`
	//  - StakeMode: "cash" (real money — requires a LICENSED club) or "play"
	//    (chips: private games, home games, freerolls). Empty => play.
	//
	//    Until this existed, money mode was a single platform-wide env switch and
	//    a table could not say what it played for, so a private home game and a
	//    raked cash game were indistinguishable to every gate. Only cash needs a
	//    licensed owner behind the club.
	StakeMode string `json:"stake_mode,omitempty" enum:"play,cash" label:"Plays for"`
	//  - RenderStyle: the owner-chosen table look, "2.5d" (portrait seats) or "3d"
	//    (GLB character bodies). Applies to EVERY seat at the table (no mixing).
	RenderStyle string `json:"render_style,omitempty" enum:"2.5d,3d" label:"Table Style"`
	//  - TableArt: the owner-chosen baked table plate id (frontend bakedTable.ts);
	//    empty => the default cinematic felt.
	TableArt string `json:"table_art,omitempty" label:"Table Art"`
	// Operating window + auto-away (dpts_8). The setup form has offered all three
	// of these since it was built and sent them on every create; TableCreateRequest
	// had no field for any of them, so json.Unmarshal dropped them silently and a
	// host who set them got a table that ignored them. They are fields now.
	//
	//  - OperatingStartMin/OperatingEndMin: a daily window in minutes past midnight
	//    UTC, wrap-midnight aware (18:00–02:00 is an evening session). Equal values
	//    mean no window, which is what every existing table sends. Enforced at the
	//    SIT-DOWN gate, not at creation: outside the window nobody may take a seat,
	//    but players already seated finish their hand rather than having the table
	//    yanked out from under a live pot.
	OperatingStartMin int `json:"operating_start_min,omitempty" validate:"min=0,max=1439" unit:"count" label:"Opens (minutes past midnight UTC)"`
	OperatingEndMin   int `json:"operating_end_min,omitempty" validate:"min=0,max=1439" unit:"count" label:"Closes (minutes past midnight UTC)"`
	//  - AutoAwayOnTimeout: sit a player OUT after two consecutive time-outs
	//    instead of folding them forever. The match handler has read this param
	//    since the tournament work; only the cash-table path never sent it.
	//  - AutoAwayBelow: hold dealing while fewer than this many players are seated
	//    (0 => off). Distinct from MinPlayers, which only decides whether a table
	//    ever starts — this keeps a table that has thinned out from blinding down
	//    the players who are still there.
	AutoAwayOnTimeout bool `json:"auto_away_on_timeout,omitempty" label:"Sit out after 2 time-outs"`
	AutoAwayBelow     int  `json:"auto_away_below,omitempty" validate:"min=0,max=10" unit:"count" label:"Pause below (players)"`
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
