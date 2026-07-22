package protocol

// Wire messages shared between server and clients.

type SitDownRequest struct {
	Seat   int   `json:"seat"`
	BuyIn  int64 `json:"buy_in"`
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
	Name       string `json:"name"`
	SmallBlind int64  `json:"small_blind"`
	BigBlind   int64  `json:"big_blind"`
	BuyIn      int64  `json:"buy_in"`
	MaxSeats   int    `json:"max_seats"`
	NumBots    int    `json:"num_bots"`
	Variant    string `json:"variant"`       // "holdem" | "plo"; empty => holdem
	DurationMins int  `json:"duration_mins"` // auto-close after N minutes (0 = no limit)
	// Optional table features (#41); all default-off so a plain table is unchanged.
	AllowStraddle   bool  `json:"allow_straddle,omitempty"`
	AllowBombPot    bool  `json:"allow_bomb_pot,omitempty"`
	BombPotAnte     int64 `json:"bomb_pot_ante,omitempty"` // per-player ante (0 => one BB when triggered)
	AllowInsurance  bool  `json:"allow_insurance,omitempty"`
	AllowRunItTwice bool  `json:"allow_run_it_twice,omitempty"`
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
