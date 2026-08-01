package holdem

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/antibot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/bot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/geo"
	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/loyalty"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/social"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

type PendingShowdown struct {
	ResultCh  <-chan poker.ShowdownResult
	PotBefore int64
	Plan      poker.ShowdownPlan
}

// pendingTournamentSeat is a queued incoming multi-table-merge seat transfer —
// see MatchState.PendingSeatIn.
type pendingTournamentSeat struct {
	Username string
	Stack    int64
}

type MatchState struct {
	Table           *poker.Table
	Phase           poker.HandPhase
	PendingShowdown *PendingShowdown
	Audit           audit.Emitter
	MatchID         string
	RoomID          string
	ClubID          string
	TournamentID    string
	// WarID / LeagueID tag a table as part of a club-war or league so per-hand
	// results accrue to those standings at settlement (empty => not participating).
	WarID      string
	LeagueID   string
	SmallBlind int64
	BigBlind   int64
	Ante       int64
	// Initial* capture the table's configured allocations at creation. Host
	// overrides (set_blinds, pause) only take effect while the host is present
	// AT the table; when the host is absent the table reverts to these initial
	// rules. Never overwritten after MatchInit.
	InitialSmallBlind int64
	InitialBigBlind   int64
	InitialAnte       int64
	BuyIn             int64
	MinBuyIn          int64 // table minimum buy-in / rebuy (0 => BuyIn)
	MaxBuyIn          int64 // table maximum buy-in (0 => 3x BuyIn)
	Presences         map[string]runtime.Presence
	// SeatWallet remembers which wallet each seat's buy-in was drawn from
	// ("global" | "club") so cash-out/refund returns chips to the SAME wallet.
	SeatWallet map[int]string
	// SeatLocked is how much a club-funded seat RESERVED at sit-down. Release has
	// to unlock the reservation, not the final stack — those differ every time a
	// player wins or loses, and unlocking the stack strands the difference in
	// locked_amount forever. See ClubStore.SettleSeat.
	SeatLocked map[int]int64
	// Seat-session tracking (Tier-1 C): per-seat open seat_session id, cumulative
	// buy-in this sitting (initial + auto-rebuys), and hands dealt while seated.
	// Drained into poker_seat_session when the player leaves (hit-and-run/rathole
	// visibility). Advisory only — never blocks play.
	SeatSessionID map[int]string
	SeatBuyIn     map[int]int64
	SeatHands     map[int]int
	// LastActionNonce dedupes a re-sent action per player (userID -> last accepted
	// nonce): a client retry / double-tap carrying the same nonce is a no-op, so a
	// flaky connection can't apply an action twice. Empty nonce => no dedup.
	LastActionNonce map[string]string
	BotCount        int
	Rand            *rand.Rand
	// Per-session AES-256-GCM keys (userID -> 32 raw bytes) used to encrypt each
	// player's own hole cards so the wire never carries plaintext card codes.
	SessionKeys map[string][]byte
	// Self-managing table lifecycle (no operator babysitting):
	DurationSecs int   // auto-close after this many seconds (0 = no limit)
	MinPlayers   int   // players required before hands auto-start (default 2)
	AutoDeal     bool  // auto-start each hand (cash tables); tournaments deal via director
	NextDealTick int64 // tick at which to auto-deal the next hand (0 = unset)
	// Host controls (the table creator can pause/kick/adjust/close live):
	HostUserID string
	HostPaused bool
	HostClosed bool
	// AdminPaused is a platform-admin freeze (tables_freeze_all). Unlike HostPaused
	// it is honored regardless of host presence — it's an operator override.
	AdminPaused bool
	// AI table host (Pipecat Cloud voice/text agent) — off by default, toggled by
	// rpc.AIHostToggle (a real host/club-admin action, resolved server-side; see
	// isClubAdminForTable). AIHostWebhookSecret authenticates the bot's own
	// outbound polls/replies (MatchSignal cases "ai_host_poll"/"ai_host_reply") —
	// the bot isn't a real player so it can't use a Nakama session for this.
	// AINarrationLog is a small ring buffer of public narrate() lines the bot
	// polls for commentary context; it never carries hole cards or solver output
	// (narrate() only ever describes what's already broadcast to everyone).
	AIHostEnabled       bool
	AIHostSessionID     string
	AIHostWebhookSecret string
	AINarrationSeq      int64
	AINarrationLog      []aiNarrationEntry
	// TournamentBreak mirrors AdminPaused's mechanics but a different source and
	// meaning: the tournament director (match/tournament/director.go) sets it
	// when its blind schedule enters an IsBreak level and clears it when that
	// level ends, so dealing actually stops for the scheduled break instead of
	// continuing through it while only a countdown display changes.
	TournamentBreak bool
	// PendingSeatOut queues a live multi-table-merge seat transfer (userID ->
	// destination match id), set by MatchSignal case "tournament_seat_out" from
	// the tournament director. Processed at MatchLoop's between-hands safe point
	// (never mid-hand, matching the cashout-lock invariant), which confirms the
	// destination accepted (queued, not necessarily seated yet — see
	// PendingSeatIn) the player via "tournament_seat_in" before standing them
	// up here — see processPendingSeatTransfers.
	PendingSeatOut map[string]string
	// PendingSeatIn queues an incoming multi-table-merge seat transfer (userID
	// -> username/stack), set by MatchSignal case "tournament_seat_in". Seating
	// them is deferred to MatchLoop's between-hands safe point exactly like
	// PendingSeatOut's removal — accepting the signal is not itself permission
	// to mutate a live hand's seat array (dealer button / action-seat indices
	// would be corrupted by a seat appearing mid-hand). See
	// processPendingSeatIn.
	PendingSeatIn map[string]pendingTournamentSeat
	// PendingKickSeats queues an admin "kick" issued while the seat was still
	// live in a hand (SeatSeated/SeatAllIn, Phase != PhaseWaiting). The
	// host_action handler narrates that the kick "will apply once it
	// finishes" but, before this field existed, nothing actually reapplied
	// it — the kick was silently dropped the moment that hand resolved, and
	// the seat stayed occupied indefinitely unless the host noticed and
	// re-issued the command at exactly the right (unlive) moment. Set here
	// instead, and drained at MatchLoop's PhaseWaiting safe point (the same
	// between-hands checkpoint PendingSeatOut/PendingSeatIn already use for
	// "can't mutate a live hand's seat array") by processPendingKicks.
	PendingKickSeats map[int]bool
	// DealerDown tracks the engine-math (rs_poker) sidecar being unreachable so the
	// table pauses dealing gracefully and tells players ONCE, rather than silently
	// failing to deal. Cleared (with a "restored" notice) on the next successful
	// StartHand. There is no local shuffle fallback (Golden rule 4) — the table
	// simply waits for the authoritative dealer service to return.
	DealerDown bool
	// Human action clock: when the seat to act is a human, ActionDeadlineTick is
	// the tick by which they must act before the server auto-checks/folds them.
	ActionDeadlineTick int64
	ActionDeadlineSeat int
	// TimeBank is each human's remaining banked seconds (userID -> secs), burned
	// only after the base ActionSecs lapses, before the server auto-folds. Granted
	// once when a player first sits; not auto-refilled.
	TimeBank map[string]int64
	// TimeoutStreak counts each human's CONSECUTIVE server-acted timeouts (userID
	// -> count); reset to 0 the moment they act voluntarily. After
	// maxConsecutiveTimeouts the inactivity auto-kick stands them up (orbit-style
	// AFK protection — the proven oddslingers mechanic).
	TimeoutStreak map[string]int
	// Per-table shot-clock config (0 => server defaults): ActionSecsCfg is the base
	// clock in seconds; TimeBankGrant is the one-time bank granted on sit;
	// TimeBankPerHand tops the bank up at the start of every hand (0 => no top-up,
	// which is the old behaviour of granting once and never refilling).
	ActionSecsCfg   int
	TimeBankGrant   int64
	TimeBankPerHand int64
	// AutoAwayOnTimeout sits a player OUT after two consecutive timeouts rather
	// than letting the server keep folding for them. Originally tournament-scoped
	// — at a cash table the inactivity rule stands a player up (standUpBusted),
	// but a tournament seat holds chips that cannot be surrendered, so away is the
	// only correct response. Cash tables now offer it too (the setup form always
	// showed the toggle; nothing carried it here), where it is the gentler option:
	// away keeps the seat, standing up ends the session.
	AutoAwayOnTimeout bool
	// AutoAwayBelowPlayers holds dealing while fewer than this many players are
	// seated (0 => off). Distinct from MinPlayers, which only gates whether a
	// table ever starts: this covers a table that filled, played, and then thinned
	// out, so nobody is blinded down short-handed at a table they joined expecting
	// a full ring. See autoAwayHoldsHand.
	AutoAwayBelowPlayers int
	// Per-hand behavioural tracking (userID -> counters), reset each hand start
	// and drained into poker_hand_stats at settlement. Feeds VPIP/PFR/AF.
	HandTrack map[string]*playerHandTrack
	// AntibotLog is a rolling window of each human's recent actions, scored at
	// settlement so bot-likelihood accrues from LIVE play (previously the scorer
	// only ran when an admin hand-posted action batches). Capped per user.
	AntibotLog map[string][]antibot.ActionRecord
	// Optional table features (#41), all per-hand and reset at hand start:
	RITAgree   map[string]bool            // userID -> agreed to run it twice
	Insurance  map[string]insurancePolicy // userID -> accepted all-in insurance
	InsOffered map[string]insurancePolicy // userID -> standing (unaccepted) offer
	// Access & seating policy (#83). Configured at MatchInit; enforced at the
	// join gate (JoinCode) and the sit-down gate (KYC / members / geo / wallet cap).
	AccessType       string // "public" | "members" | "invite" (empty => public)
	JoinCode         string // required in join metadata when AccessType == "invite"
	AllowSpectators  bool   // when false, non-seated presences are not sent table state
	KYCRequired      bool   // table-level KYC floor (adds to the platform floor)
	GeoRestricted    bool   // re-check the seating player's jurisdiction at sit-down
	WalletLimitCents int64  // cap on total chips one player may bring (0 => no cap)
	AutoBuyBackCents int64  // auto top-up a busted player to this stack (0 => off)
	NoMaxBuyIn       bool   // unlimited buy-in (no max) — PLAY-MONEY tables only
	RenderStyle      string // owner-chosen table look: "2.5d" | "3d" (empty => per-device)
	TableArt         string // owner-chosen baked table plate id (empty => cinematic felt)
	// StakeMode is what this table plays for: store.StakeCash (real money) or
	// store.StakePlay (chips). Cash tables require the club to be licensed, and
	// re-check at sit-down because a licence can lapse while a table is running.
	StakeMode string
	// Daily operating window in minutes past midnight UTC, wrap-midnight aware
	// (see store.WithinDailyWindow). Equal values mean always-open, which is what
	// every table created before this existed reports. Enforced at sit-down only:
	// closing time stops new players taking a seat, it does not evict a live pot.
	OperatingStartMin int
	OperatingEndMin   int
}

// insurancePolicy is one all-in insurance wager, settled against the wallet (not
// the pot): the player pays Premium up front and receives Payout if they lose.
type insurancePolicy struct {
	Seat    int
	Premium int64
	Payout  int64
	Equity  float64
}

// autoDealDelayTicks is the breather between hands on a self-dealing table
// (MatchInit sets tick rate = 10/s, so 4 ticks ≈ 0.4s).
const autoDealDelayTicks = 4

// actionTimeoutTicks bounds how long a human may take to act before the server
// acts for them (check if free, else fold). Without it a disconnected or AFK
// player freezes the whole table indefinitely. At 10 ticks/s this is 30 seconds.
const actionTimeoutTicks int64 = 300

// timeBankSecs is the per-player time bank granted once on sit (seconds), burned
// after the base action clock lapses before the server auto-folds. At 10 ticks/s
// the base clock (actionTimeoutTicks) is 30s, so actionSecs is derived from it.
const timeBankSecs int64 = 30
const actionSecs int = int(actionTimeoutTicks / 10)

// maxConsecutiveTimeouts is how many times the server may act for a human in a
// row (time-outs) before the inactivity auto-kick stands them up, freeing the
// seat so an AFK player can't hold a table hostage. Reset by any voluntary act.
const maxConsecutiveTimeouts = 3

// autoAwayTimeoutStreak is the "2x timeout" of the tournament builder's
// Auto-Away rule: two consecutive server-acted timeouts sit the player out.
// Deliberately stricter than maxConsecutiveTimeouts (the cash-table stand-up
// threshold) — a tournament seat that stops acting is blocking a whole field.
const autoAwayTimeoutStreak = 2

// Tier-1 C (hit-and-run / ratholing) thresholds. Advisory flags only.
const ratholeWindowSecs = 30 * 60 // re-buying short within 30 min of leaving bigger = rathole
const hitAndRunMinHands = 10      // leaving with a net win in fewer hands than this = hit-and-run

type Handler struct{}

// realMoneyEnabled mirrors the rpc-layer kill switch: when off (default), no
// table plays for real value, so bots are permitted and KYC-at-sit is moot. When
// on, bots are barred from tables and seating requires KYC/AML (the platform
// floor — a club can only ADD verification, never opt out of this).
func realMoneyEnabled() bool { return os.Getenv("REAL_MONEY_ENABLED") == "true" }

// numParam reads a numeric match param regardless of concrete type. Params set
// via nk.MatchCreate from Go arrive as native int/int64; the same params set from
// a JSON path arrive as float64. Asserting only float64 silently dropped every
// numeric table setting (blinds, buy-in, seats, bots) created through the RPC.
func numParam(params map[string]interface{}, key string) (int64, bool) {
	switch v := params[key].(type) {
	case float64:
		return int64(v), true
	case float32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	case int32:
		return int64(v), true
	default:
		return 0, false
	}
}

func (h *Handler) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	roomID := "room"
	clubID := ""
	if v, ok := numParam(params, "small_blind"); ok {
		sb = v
	}
	if v, ok := numParam(params, "big_blind"); ok {
		bb = v
	}
	if v, ok := numParam(params, "buy_in"); ok {
		buyIn = v
	}
	minBuyIn := buyIn
	if v, ok := numParam(params, "min_buy_in"); ok && v > 0 {
		minBuyIn = v
	}
	maxBuyIn := buyIn * 3
	if v, ok := numParam(params, "max_buy_in"); ok && v > 0 {
		maxBuyIn = v
	}
	if maxBuyIn < minBuyIn {
		maxBuyIn = minBuyIn
	}
	if v, ok := params["room_id"].(string); ok {
		roomID = v
	}
	if v, ok := params["club_id"].(string); ok {
		clubID = v
	}
	tournamentID := ""
	if v, ok := params["tournament_id"].(string); ok {
		tournamentID = v
	}
	warID := ""
	if v, ok := params["war_id"].(string); ok {
		warID = v
	}
	leagueID := ""
	if v, ok := params["league_id"].(string); ok {
		leagueID = v
	}
	maxSeats := 6
	if v, ok := numParam(params, "max_seats"); ok && v >= 2 {
		maxSeats = int(v)
	}
	numBots := 0
	if v, ok := numParam(params, "num_bots"); ok && v > 0 {
		numBots = int(v)
	}
	if numBots > maxSeats-1 {
		numBots = maxSeats - 1
	}
	// No bots on real-money tables — undisclosed AI against real stakes is a
	// reputational (and in places legal) non-starter. Bots stay play-only.
	if realMoneyEnabled() {
		numBots = 0
	}
	// Minimum players required before hands auto-start. Operator-configurable
	// (default 2 — heads-up); clamped to [2, maxSeats] so a table can never be
	// set to start with fewer than two players or need more than it can seat.
	minPlayers := 2
	if v, ok := numParam(params, "min_players"); ok && v >= 2 {
		minPlayers = int(v)
	}
	if minPlayers > maxSeats {
		minPlayers = maxSeats
	}
	durationSecs := 0
	if v, ok := numParam(params, "duration_secs"); ok && v > 0 {
		durationSecs = int(v)
	}
	actionSecsCfg := 0
	if v, ok := numParam(params, "action_secs"); ok && v > 0 {
		actionSecsCfg = int(v)
	}
	timeBankCfg := int64(0)
	if v, ok := numParam(params, "time_bank_secs"); ok && v > 0 {
		timeBankCfg = v
	}
	timeBankPerHand := int64(0)
	if v, ok := numParam(params, "time_bank_per_hand"); ok && v > 0 {
		timeBankPerHand = v
	}
	stakeMode := string(store.StakePlay)
	if v, ok := params["stake_mode"].(string); ok && v != "" {
		stakeMode = string(store.ValidStakeMode(v))
	}
	autoAwayOnTimeout := false
	if v, ok := params["auto_away_on_timeout"].(bool); ok {
		autoAwayOnTimeout = v
	}
	autoAwayBelowPlayers := 0
	if v, ok := numParam(params, "auto_away_below"); ok && v > 0 {
		autoAwayBelowPlayers = int(v)
	}
	// Operating window. Out-of-range values collapse the window to always-open
	// rather than closing the table: a malformed param must not lock everyone out
	// of a table that was working a moment ago. table_create rejects bad values at
	// the boundary, so this only catches a hand-built MatchCreate.
	operatingStartMin, operatingEndMin := 0, 0
	if v, ok := numParam(params, "operating_start_min"); ok {
		operatingStartMin = int(v)
	}
	if v, ok := numParam(params, "operating_end_min"); ok {
		operatingEndMin = int(v)
	}
	if !store.ValidDailyMinute(operatingStartMin) || !store.ValidDailyMinute(operatingEndMin) {
		operatingStartMin, operatingEndMin = 0, 0
	}
	hostUserID := ""
	if v, ok := params["host_user_id"].(string); ok {
		hostUserID = v
	}

	variant := poker.VariantHoldem
	if v, ok := params["variant"].(string); ok && v != "" {
		variant = v
	}

	table := poker.NewTable()
	table.SetSeatCap(maxSeats)
	table.SetVariant(variant)
	// Optional table features (#41). All default-off; a table with none of these
	// params behaves exactly as before.
	if v, ok := params["allow_straddle"].(bool); ok {
		table.AllowStraddle = v
	}
	if v, ok := params["allow_bomb_pot"].(bool); ok {
		table.AllowBombPot = v
	}
	if v, ok := numParam(params, "bomb_pot_ante"); ok && v > 0 {
		table.BombPotAnte = v
	}
	if v, ok := params["allow_insurance"].(bool); ok {
		table.AllowInsurance = v
	}
	if v, ok := params["allow_run_it_twice"].(bool); ok {
		table.AllowRunItTwice = v
	}
	// Access & seating policy (#83). Parsed here; enforced at the join gate
	// (join_code) and the sit-down gate (kyc / members / geo / wallet cap).
	accessType := ""
	if v, ok := params["access_type"].(string); ok {
		accessType = v
	}
	joinCode := ""
	if v, ok := params["join_code"].(string); ok {
		joinCode = strings.ToUpper(strings.TrimSpace(v))
	}
	allowSpectators := true // default: rail is open unless the host disables it
	if v, ok := params["allow_spectators"].(bool); ok {
		allowSpectators = v
	}
	kycRequired := false
	if v, ok := params["kyc_required"].(bool); ok {
		kycRequired = v
	}
	geoRestricted := false
	if v, ok := params["geo_restricted"].(bool); ok {
		geoRestricted = v
	}
	walletLimitCents := int64(0)
	if v, ok := numParam(params, "wallet_limit_cents"); ok && v > 0 {
		walletLimitCents = v
	}
	autoBuyBackCents := int64(0)
	if v, ok := numParam(params, "auto_buy_back_cents"); ok && v > 0 {
		autoBuyBackCents = v
	}
	// Unlimited buy-in (no max) — honored ONLY for play-money tables; a real-money
	// table always keeps its max buy-in cap (table-stakes / AML).
	noMaxBuyIn := false
	if v, ok := params["no_max_buyin"].(bool); ok && v && !realMoneyEnabled() {
		noMaxBuyIn = true
	}
	// Owner-chosen table look ("2.5d" | "3d"); empty falls back to per-device pref.
	renderStyle := ""
	if v, ok := params["render_style"].(string); ok {
		renderStyle = v
	}
	// Owner-chosen baked table plate id; empty falls back to the cinematic felt.
	tableArt := ""
	if v, ok := params["table_art"].(string); ok {
		tableArt = v
	}
	// Seed AI opponents at creation (server-authoritative, like OddSlingers).
	// noMaxBuyIn, not the unconditional clamp: a table created "Unlimited
	// buy-in (play money)" must not seat its own bots at the $1,000 default
	// while human players at the same table can correctly buy in above it.
	for i := 0; i < numBots; i++ {
		seat := table.FirstEmptySeat()
		if seat < 0 {
			break
		}
		botBuyIn := poker.ClampBuyInBand(buyIn, noMaxBuyIn)
		botID := fmt.Sprintf("bot_%s_%d", roomID, seat)
		botName := fmt.Sprintf("Bot_%d", i+1)
		if noMaxBuyIn {
			_ = table.SitDownBotUnlimited(seat, botID, botName, botBuyIn)
		} else {
			_ = table.SitDownBot(seat, botID, botName, botBuyIn)
		}
	}
	state := &MatchState{
		Table:    table,
		BotCount: numBots,
		Phase:    poker.PhaseWaiting,
		Audit: audit.MultiEmitter{Sinks: []audit.Emitter{
			audit.NewPostgresEmitter(db),
			audit.NewArweaveEmitter(),
		}},
		RoomID:       roomID,
		ClubID:       clubID,
		TournamentID: tournamentID,
		WarID:        warID,
		LeagueID:     leagueID,
		SmallBlind:   sb,
		BigBlind:     bb,
		// Snapshot the configured allocations so host overrides can be reverted
		// when the host leaves the table (see hostPresent / effSmallBlind).
		InitialSmallBlind:    sb,
		InitialBigBlind:      bb,
		BuyIn:                buyIn,
		MinBuyIn:             minBuyIn,
		MaxBuyIn:             maxBuyIn,
		Presences:            map[string]runtime.Presence{},
		SeatWallet:           map[int]string{},
		SeatLocked:           map[int]int64{},
		SeatSessionID:        map[int]string{},
		SeatBuyIn:            map[int]int64{},
		SeatHands:            map[int]int{},
		LastActionNonce:      map[string]string{},
		Rand:                 rand.New(rand.NewSource(time.Now().UnixNano())),
		SessionKeys:          map[string][]byte{},
		RITAgree:             map[string]bool{},
		Insurance:            map[string]insurancePolicy{},
		InsOffered:           map[string]insurancePolicy{},
		AntibotLog:           map[string][]antibot.ActionRecord{},
		TimeBank:             map[string]int64{},
		TimeoutStreak:        map[string]int{},
		ActionSecsCfg:        actionSecsCfg,
		TimeBankGrant:        timeBankCfg,
		TimeBankPerHand:      timeBankPerHand,
		AutoAwayOnTimeout:    autoAwayOnTimeout,
		AutoAwayBelowPlayers: autoAwayBelowPlayers,
		StakeMode:            stakeMode,
		// Daily operating window (dpts_8).
		OperatingStartMin: operatingStartMin,
		OperatingEndMin:   operatingEndMin,
		DurationSecs:      durationSecs,
		MinPlayers:        minPlayers,
		// Cash tables deal themselves (no operator babysitting); tournament tables
		// are driven by the tournament director, so they opt out.
		AutoDeal:   tournamentID == "",
		HostUserID: hostUserID,
		// Access & seating policy (#83).
		AccessType:       accessType,
		JoinCode:         joinCode,
		AllowSpectators:  allowSpectators,
		KYCRequired:      kycRequired,
		GeoRestricted:    geoRestricted,
		WalletLimitCents: walletLimitCents,
		AutoBuyBackCents: autoBuyBackCents,
		NoMaxBuyIn:       noMaxBuyIn,
		RenderStyle:      renderStyle,
		TableArt:         tableArt,
	}
	label := buildLabel(state)
	// 10 ticks/sec: a 1 Hz loop made deals, chip moves, and action prompts update
	// only once per second (visibly sluggish) and paced self-dealing tables at ~7s
	// per hand. 10 Hz keeps the table responsive without meaningful extra cost.
	return state, 10, label
}

// minToStart is the number of seated players required before a hand starts,
// defaulting to 2 for tables created before min_players existed.
func (s *MatchState) minToStart() int {
	if s.MinPlayers >= 2 {
		return s.MinPlayers
	}
	return 2
}

// hostPresent reports whether the table's host is currently connected to the
// match. Host-only overrides (set_blinds, pause) are honored only while the
// host is at the table; when the host leaves, the table reverts to its initial
// setup rules. A hostless table (tournaments, whose blinds are director-driven)
// has HostUserID == "" and is never subject to this reversion.
func (s *MatchState) hostPresent() bool {
	return s.HostUserID != "" && s.Presences[s.HostUserID] != nil
}

// hostAbsent is true only when a host is configured but not currently present.
func (s *MatchState) hostAbsent() bool {
	return s.HostUserID != "" && !s.hostPresent()
}

// effSmallBlind / effBigBlind return the blinds actually in force: the host's
// override while the host is present, otherwise the table's initial blinds.
// Hostless tables (tournaments) always use the live value (director-controlled).
func (s *MatchState) effSmallBlind() int64 {
	if s.hostAbsent() {
		return s.InitialSmallBlind
	}
	return s.SmallBlind
}

func (s *MatchState) effBigBlind() int64 {
	if s.hostAbsent() {
		return s.InitialBigBlind
	}
	return s.BigBlind
}

// effPaused reports whether dealing is paused in force. A host's pause only
// holds while the host is at the table; once the host leaves the table resumes
// on its initial rules. The host's intent (s.HostPaused) is retained and
// re-applies if they return.
func (s *MatchState) effPaused() bool {
	if s.hostAbsent() {
		return false
	}
	return s.HostPaused
}

// actionTicks is the base action-clock length in ticks: the per-table config
// (ActionSecsCfg seconds × 10 ticks/s) when set, else the server default.
func (s *MatchState) actionTicks() int64 {
	if s.ActionSecsCfg > 0 {
		return int64(s.ActionSecsCfg) * 10
	}
	return actionTimeoutTicks
}

// actionSecsEff is the base action clock in seconds sent to the client.
func (s *MatchState) actionSecsEff() int {
	if s.ActionSecsCfg > 0 {
		return s.ActionSecsCfg
	}
	return actionSecs
}

// timeBankGrant is the one-time time-bank granted on sit (per-table when set).
func (s *MatchState) timeBankGrant() int64 {
	if s.TimeBankGrant > 0 {
		return s.TimeBankGrant
	}
	return timeBankSecs
}

// refillTimeBanks tops every seated human's bank up by TimeBankPerHand at the
// start of a hand, capped at the total grant. This is the design's composite
// time bank ("60s total, 5s per hand"); with TimeBankPerHand at 0 the bank is
// granted once and never refilled, which is the previous behaviour.
func (s *MatchState) refillTimeBanks() {
	if s.TimeBankPerHand <= 0 || s.Table == nil {
		return
	}
	cap := s.timeBankGrant()
	if s.TimeBank == nil {
		s.TimeBank = map[string]int64{}
	}
	for _, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot || seat.UserID == "" {
			continue
		}
		v := s.TimeBank[seat.UserID] + s.TimeBankPerHand
		if v > cap {
			v = cap
		}
		s.TimeBank[seat.UserID] = v
	}
}

// autoAwayHoldsHand reports whether the table should hold off dealing because it
// has thinned below the host's "Auto-Away if Players Below N" threshold.
//
// This is NOT MinPlayers, which gates whether a table ever starts. This handles a
// table that fills, plays, and then empties out: a 9-max club table that drops to
// two players would otherwise grind those two heads-up, blinding down whoever
// stepped away, at a table they joined expecting a full ring.
//
// It pauses dealing rather than flipping SittingOut on everyone. Mutating seat
// status is a one-way door — the players would each have to sit back in by hand
// once the table refilled, and a player who had already stepped away would never
// do so. Pausing self-heals: the moment enough players are back, the next tick
// deals. From the seat it looks identical (no blinds are posted either way).
func (s *MatchState) autoAwayHoldsHand() bool {
	if s.AutoAwayBelowPlayers <= 0 || s.Table == nil {
		return false
	}
	return s.Table.SeatedCount() < s.AutoAwayBelowPlayers
}

func (h *Handler) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	s := state.(*MatchState)
	// Invite-only tables (#83): a join must carry the correct code in metadata.
	// The host always gets in (so they can open/manage their own table). An empty
	// JoinCode means "invite" was selected but no code was set — treat as open.
	if s.AccessType == "invite" && s.JoinCode != "" {
		if uid := presence.GetUserId(); uid != "" && uid == s.HostUserID {
			return state, true, ""
		}
		got := strings.ToUpper(strings.TrimSpace(metadata["join_code"]))
		if got != s.JoinCode {
			return state, false, "this table is invite-only — a valid join code is required"
		}
	}
	return state, true, ""
}

func (h *Handler) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	for _, p := range presences {
		uid := p.GetUserId()
		s.Presences[uid] = p
		issueSessionKey(dispatcher, s, uid, p)
	}
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	return s
}

// issueSessionKey ensures a per-session AES key exists for the user and sends it
// (base64) to that one player, so they can decrypt their own hole cards.
func issueSessionKey(dispatcher runtime.MatchDispatcher, s *MatchState, userID string, p runtime.Presence) {
	if s.SessionKeys == nil {
		s.SessionKeys = map[string][]byte{}
	}
	key, ok := s.SessionKeys[userID]
	if !ok {
		key = make([]byte, 32)
		if _, err := crand.Read(key); err != nil {
			return
		}
		s.SessionKeys[userID] = key
	}
	msg, _ := json.Marshal(protocol.SessionKeyMessage{Key: base64.StdEncoding.EncodeToString(key)})
	_ = dispatcher.BroadcastMessage(protocol.OpSessionKey, msg, []runtime.Presence{p}, nil, true)
}

// encryptForUser AES-256-GCM encrypts plaintext with the user's session key,
// returning base64(nonce || ciphertext). Returns "" if no key (caller falls
// back to plaintext).
func encryptForUser(s *MatchState, userID string, plaintext []byte) string {
	key, ok := s.SessionKeys[userID]
	if !ok {
		return ""
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return ""
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ""
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := crand.Read(nonce); err != nil {
		return ""
	}
	ct := gcm.Seal(nil, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(append(nonce, ct...))
}

// MatchLeave fires on every socket disconnect — tab close, network drop, app
// crash, forced logout. It called Table.StandUp directly, which just nils the
// seat: t.Seats[seat] = nil, with the Stack field and everything in it. Every
// OTHER exit path in this file (voluntary stand-up, host kick, inactivity
// eviction, RG eviction, table close) returns the stack through releaseBuyIn
// first. This one never did. Any player who lost wifi, closed their laptop, or
// had the app crash while seated lost their entire stack, unconditionally,
// every time — not credited, not locked, not logged, just gone. This was true
// on every table since the handler shipped.
//
// The fix reuses two pieces of machinery already proven correct elsewhere in
// this file rather than inventing new disconnect/reconnect logic:
//
//  1. The same cashout-lock OpStandUp already enforces: a seat holding live
//     cards in a live hand (SeatSeated or SeatAllIn while the hand is running)
//     is left exactly as it is. Yanking it out on a network blip would corrupt
//     the hand for everyone still in it and abandon their chips mid-pot with
//     no owner. enforceActionDeadline cannot tell a disconnected socket from
//     an AFK-but-connected one — it never needs to, since it only reads
//     Table/seat state, never presence — so it auto-checks/folds this seat on
//     its own schedule exactly as it already does for anyone else who stops
//     acting. If the disconnect turns out to be permanent, the inactivity
//     auto-kick in standUpBusted takes over after maxConsecutiveTimeouts, and
//     that path already calls releaseBuyIn correctly.
//  2. Everywhere else — the seat is safe to vacate immediately (between hands,
//     or already folded) — release the buy-in exactly the way every other
//     stand-up path in this file does, instead of discarding it.
func (h *Handler) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	seatReg := store.NewActiveSeatStore(db)
	for _, p := range presences {
		userID := p.GetUserId()
		delete(s.Presences, userID)
		for i, seat := range s.Table.Seats {
			if seat == nil || seat.UserID != userID {
				continue
			}
			if s.Phase != poker.PhaseWaiting && (seat.Status == poker.SeatSeated || seat.Status == poker.SeatAllIn) {
				break // mid-hand: leave the seat live for the action clock to handle
			}
			closeSeatSession(ctx, db, s, i)
			releaseBuyIn(ctx, logger, db, s, i, userID, seat.Stack)
			delete(s.SeatWallet, i)
			delete(s.SeatLocked, i)
			s.Table.StandUp(i)
			break
		}
		_ = seatReg.Unregister(ctx, userID, matchIDForAudit(s))
	}
	dispatcher.MatchLabelUpdate(buildLabel(s))
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	return s
}

func (h *Handler) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*MatchState)

	if s.Phase == poker.PhaseResolvingSidePots {
		if finished := pollPendingShowdown(ctx, logger, db, dispatcher, nk, s); finished {
			return s
		}
	}

	// Self-managing table lifecycle, evaluated only between hands so a live pot is
	// never abandoned: close after the configured duration or a host close, else
	// auto-deal (unless the host paused the table).
	if s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
		if len(s.PendingSeatIn) > 0 {
			processPendingSeatIn(ctx, logger, db, dispatcher, s)
		}
		if len(s.PendingSeatOut) > 0 {
			processPendingSeatTransfers(ctx, logger, db, nk, dispatcher, s)
		}
		if len(s.PendingKickSeats) > 0 {
			processPendingKicks(ctx, logger, db, dispatcher, s)
		}
		if s.HostClosed {
			closeTable(ctx, logger, db, dispatcher, s, "closed by host")
			return nil
		}
		if s.DurationSecs > 0 && tick >= int64(s.DurationSecs) {
			closeTable(ctx, logger, db, dispatcher, s, "scheduled time reached")
			return nil // ending the match releases the handler
		}
		if s.AutoDeal && !s.effPaused() && !s.AdminPaused && !s.TournamentBreak && s.Table.SeatedCount() >= s.minToStart() && len(s.Presences) >= 1 {
			if s.NextDealTick == 0 {
				s.NextDealTick = tick + autoDealDelayTicks
			} else if tick >= s.NextDealTick {
				s.NextDealTick = 0
				autoStartHand(ctx, logger, db, dispatcher, s)
			}
		}
	} else {
		s.NextDealTick = 0
	}

	for _, msg := range messages {
		userID := msg.GetUserId()
		presence, ok := s.Presences[userID]
		if !ok {
			continue
		}

		// Chat and standing up are allowed at any time; game actions are gated
		// to the betting phase.
		// Straddle-arming and run-it-twice votes are lightweight opt-ins that may
		// arrive between hands (like chat / standing up), so they bypass the
		// betting-phase gate; their handlers validate table state themselves.
		// Sitting down and standing up (like chat) are table-management actions,
		// not in-hand game actions — a player must be able to take a seat between
		// hands, not only mid-betting. Only fold/check/call/raise are gated to the
		// betting phase.
		if !s.Phase.AllowsPlayerActions() &&
			msg.GetOpCode() != protocol.OpSitDown && msg.GetOpCode() != protocol.OpStandUp &&
			msg.GetOpCode() != protocol.OpChatSend && msg.GetOpCode() != protocol.OpMoveSeat &&
			msg.GetOpCode() != protocol.OpSitOut && msg.GetOpCode() != protocol.OpAddChips &&
			msg.GetOpCode() != protocol.OpPostStraddle && msg.GetOpCode() != protocol.OpRunItTwice {
			sendError(dispatcher, presence, "hand_busy", "showdown in progress")
			continue
		}

		switch msg.GetOpCode() {
		case protocol.OpSitDown:
			var req protocol.SitDownRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				sendError(dispatcher, presence, "invalid_payload", err.Error())
				continue
			}
			// One seat per player, per table. Table.SitDown only refuses a seat that
			// is already occupied — nothing stopped the SAME player from sitting a
			// second, empty seat at this table, which hands them two hole-card
			// hands and two actions per betting round against a field that only
			// gets one each. A modified client could send OpSitDown twice with two
			// different seat indices; nothing server-side ever checked for it.
			alreadySeated := false
			for _, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					alreadySeated = true
					break
				}
			}
			if alreadySeated {
				sendError(dispatcher, presence, "already_seated", "you already have a seat at this table")
				continue
			}
			// Tournament seats are director-managed: reserveBuyIn returns
			// "tournament" unconditionally for any TournamentID table (no wallet
			// debit — the buy-in was already taken at registration), which meant
			// nothing here ever checked the sitter actually WAS a registered
			// entrant. Registration-time gates (tier cap, and now club
			// membership for a club-owned event) meant nothing if anyone who
			// discovered the table's match_id could just sit down directly.
			if s.TournamentID != "" {
				if ok, err := store.NewTournamentStore(db).IsRegistered(ctx, s.TournamentID, userID); err != nil || !ok {
					sendError(dispatcher, presence, "not_registered", "you are not registered for this tournament")
					continue
				}
			}

			buyIn := s.BuyIn
			if req.BuyIn > 0 {
				buyIn = req.BuyIn
			}
			// Enforce the table's buy-in band: [MinBuyIn, MaxBuyIn]. A rebuy after
			// busting must be at least the minimum.
			if buyIn < s.minBuyIn() {
				buyIn = s.minBuyIn()
			}
			// Unlimited (play-money) tables skip the max cap + global clamp; the
			// table floor above still applies. Capped / real-money tables enforce
			// the table max and the global safety clamp.
			if !s.NoMaxBuyIn {
				if buyIn > s.maxBuyIn() {
					buyIn = s.maxBuyIn()
				}
				buyIn = poker.ClampBuyIn(buyIn)
			}
			// Anti-ratholing (#33): a player returning to THIS cash table within the
			// window must buy in for at least the stack they left with — they can't
			// leave big and re-buy short to lock in a win. The required floor overrides
			// the table max upward (they earned those chips). Enforced, not just
			// flagged; the seat-session's Ratholed flag remains as an operator record.
			if s.TournamentID == "" {
				if prev, _ := store.NewSeatSessionStore(db).LastClosedAtTable(ctx, matchIDForAudit(s), userID); prev != nil && prev.LeftAt != nil {
					if time.Since(*prev.LeftAt) < ratholeWindowSecs*time.Second && buyIn < prev.StackAtLeaveMinor {
						sendError(dispatcher, presence, "rathole", fmt.Sprintf(
							"you left this table with $%d.%02d in the last %d minutes — you must return with at least that",
							prev.StackAtLeaveMinor/100, prev.StackAtLeaveMinor%100, ratholeWindowSecs/60))
						continue
					}
				}
			}
			// Universal wallet limit (#83): cap the total chips one player may bring
			// to this table. Clamp the buy-in down to the remaining headroom; reject
			// when it can no longer cover the table minimum.
			if s.WalletLimitCents > 0 {
				existing := int64(0)
				for _, seat := range s.Table.Seats {
					if seat != nil && seat.UserID == userID {
						existing += seat.Stack
					}
				}
				room := s.WalletLimitCents - existing
				if room < s.minBuyIn() {
					sendError(dispatcher, presence, "wallet_limit", "this table's wallet limit leaves too little for the minimum buy-in")
					continue
				}
				if buyIn > room {
					buyIn = room
				}
			}
			// Responsible-gambling gate: a player who has self-excluded or is in a
			// cool-off window cannot take a seat until it lifts. (Set via
			// rg_self_exclude / rg_cool_off — previously stored but never enforced.)
			if blocked, kind, until, _ := store.NewResponsibleStore(db).IsRestricted(ctx, userID); blocked {
				sendError(dispatcher, presence, "rg_"+kind,
					fmt.Sprintf("you are in a %s period until %s", strings.ReplaceAll(kind, "_", "-"), until.Format("Jan 2, 2006")))
				continue
			}
			// KYC platform floor: when real money is live, taking a seat (committing a
			// buy-in) requires KYC/AML. This is enforced server-side regardless of any
			// club setting — a club can only ADD verification, never opt out of this.
			if realMoneyEnabled() {
				st, _ := store.NewVerificationStore(db).Statuses(ctx, userID)
				if st["kyc_aml"] != "verified" {
					sendError(dispatcher, presence, "kyc_required", "identity verification (KYC/AML) is required to sit at a real-money table")
					continue
				}
			}
			// Table-level access policy (#83): per-table gates the host set at
			// creation, layered on top of the platform floors above.
			// (a) Table KYC floor — verification required to sit even when the
			// platform real-money switch is off.
			if s.KYCRequired {
				st, _ := store.NewVerificationStore(db).Statuses(ctx, userID)
				if st["kyc_aml"] != "verified" {
					sendError(dispatcher, presence, "kyc_required", "this table requires identity verification (KYC) to take a seat")
					continue
				}
			}
			// (b) Members-only — a club-bound members table only seats current
			// club members (active status).
			if s.AccessType == "members" && s.ClubID != "" {
				m, _ := store.NewClubStore(db).GetMembership(ctx, s.ClubID, userID)
				if m == nil || (m.Status != "" && m.Status != "active") {
					sendError(dispatcher, presence, "members_only", "this table is limited to club members")
					continue
				}
			}
			// (c) Geo-restricted — re-check the seating player's jurisdiction.
			// Fail-open on an unknown IP (the match loop may not carry one), matching
			// the platform geofence policy; explicit deny rules are always honored.
			if s.GeoRestricted {
				if ip, _ := ctx.Value(runtime.RUNTIME_CTX_CLIENT_IP).(string); ip != "" {
					if ok, reason := store.NewAdminStore(db).CheckIP(ctx, ip); !ok {
						sendError(dispatcher, presence, "geo_blocked", reason)
						continue
					}
					if ok, reason := store.NewGeoStore(db).CheckCountry(ctx, geo.Country(ctx, ip)); !ok {
						sendError(dispatcher, presence, "geo_blocked", reason)
						continue
					}
				}
			}
			// (d) Operating hours — a table with a daily window seats nobody
			// outside it. The check is HERE and not in the hand loop on purpose:
			// closing time must stop new players sitting down, but it must never
			// pull a seated player out of a live pot. A table empties itself as
			// players stand up, which is what "closing" means at a poker table.
			//
			// The host is exempt, so an operator can always take their own seat to
			// set up or wind down a session outside the advertised hours.
			if userID != s.HostUserID && !store.WithinDailyWindow(s.OperatingStartMin, s.OperatingEndMin, time.Now()) {
				sendError(dispatcher, presence, "outside_operating_hours",
					"this table is open "+store.DailyWindowLabel(s.OperatingStartMin, s.OperatingEndMin))
				continue
			}
			// A licence can lapse while a table is running — the owner's plan
			// expires, or their KYC is revoked. Re-checked here so an unlicensed
			// club stops seating players rather than continuing until someone
			// notices. Seated players finish their session; only new seats stop.
			if store.StakeMode(s.StakeMode) == store.StakeCash && s.ClubID != "" {
				if lic := store.LicenceFor(ctx, db, s.ClubID); !lic.CanHostCash {
					sendError(dispatcher, presence, "club_unlicensed",
						"this club can no longer host cash games — "+lic.Reason)
					continue
				}
			}
			tier := billing.GetTierDef(store.SubscriptionTier(ctx, db, userID))

			// Tier gate: the stakes cap. table_create already caps what a HOST may
			// open; nothing capped who may SIT at it, so a free account could take
			// a seat in the biggest game on the platform and the "Max BB" a
			// subscriber pays for bought them nothing.
			//
			// Through EffectiveMaxBigBlindCents, never the raw field: the catalog
			// overloads 0 to mean BOTH "play chips only" (free) and "unlimited"
			// (platinum), so reading it directly hands the free tier unlimited
			// stakes — precisely backwards.
			//
			// No guest exemption: SubscriptionTier resolves a guest (no
			// subscription row) to "free" the same as anyone else, so this cap
			// already applies to guests correctly — a `!isGuest(...)` carve-out
			// here would exempt them from it entirely, letting a trivially-created
			// guest account sit at unlimited-stakes tables the actual free tier
			// (and CLAUDE.md's own "guests reach only the table-code path" intent)
			// never allows.
			if maxBB := billing.EffectiveMaxBigBlindCents(tier.ID); s.BigBlind > maxBB {
				sendError(dispatcher, presence, "stake_limit", fmt.Sprintf(
					"this table's big blind is above your plan's limit of $%d — upgrade to sit here",
					maxBB/100))
				continue
			}
			// Tier gate: enforce the multi-table limit (tables seated at once).
			seatReg := store.NewActiveSeatStore(db)
			matchKey := matchIDForAudit(s)
			if !seatReg.IsSeated(ctx, userID, matchKey) {
				if limit := tier.MultiTableLimit; limit > 0 {
					if cnt, _ := seatReg.Count(ctx, userID); cnt >= limit {
						sendError(dispatcher, presence, "multi_table_limit", "you have reached your plan's simultaneous-table limit")
						continue
					}
				}
			}
			// Certification rule: registered players buy in from the certified
			// global wallet; only guests use club-allocated comp chips.
			guest := isGuest(ctx, nk, userID)
			wallet, reserved := reserveBuyIn(ctx, db, s, userID, buyIn, req.Wallet, guest)
			if wallet == "" {
				msg := "not enough funds in the selected wallet"
				if !guest && s.ClubID != "" {
					msg = "cash games require a funded global wallet — club chips can't be used"
				}
				sendError(dispatcher, presence, "buy_in_failed", msg)
				continue
			}
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			// Use `reserved` (reserveBuyIn's actual post-clamp amount), not the raw
			// `buyIn` argument, for everything below — the seat stack, SeatLocked,
			// and any failure-path release all have to agree with what was
			// actually reserved, or the table either destroys the difference
			// (recording less than was taken) or mints it from nothing (recording
			// more).
			sitErr := error(nil)
			if s.NoMaxBuyIn {
				sitErr = s.Table.SitDownUnlimited(req.Seat, userID, username, reserved)
			} else {
				sitErr = s.Table.SitDown(req.Seat, userID, username, reserved)
			}
			if sitErr != nil {
				// releaseBuyInAs, not releaseBuyIn: this reservation was never
				// recorded into SeatWallet/SeatLocked (we're bailing out before
				// that happens a few lines down), so releaseBuyIn's usual lookup
				// of those seat-indexed maps would see whatever stale value they
				// already held for this seat index — never "club", since this
				// attempt never got that far — and credit the wrong wallet
				// entirely. A club guest's reservation would sit stuck in
				// locked_amount forever while their global wallet was minted the
				// same amount from nothing.
				releaseBuyInAs(ctx, logger, db, s, userID, wallet, reserved, reserved)
				sendError(dispatcher, presence, "sit_failed", sitErr.Error())
				continue
			}
			s.SeatWallet[req.Seat] = wallet
			if wallet == "club" {
				// Remember what was RESERVED. The stack that eventually leaves the
				// table is a different number, and releasing that one instead
				// strands the difference in locked_amount (ClubStore.SettleSeat).
				if s.SeatLocked == nil {
					s.SeatLocked = map[int]int64{}
				}
				s.SeatLocked[req.Seat] = reserved
			}
			if s.TimeBank == nil {
				s.TimeBank = map[string]int64{}
			}
			if _, ok := s.TimeBank[userID]; !ok {
				s.TimeBank[userID] = s.timeBankGrant() // one-time grant per player
			}
			// No "buying the button": a player who joins after the game has started
			// owes a post (dead SB + live BB) before being dealt in, unless the big
			// blind naturally reaches their seat. They may elect to post immediately
			// (PostNow). On a fresh table (HandNo == 0) everyone is dealt in for free
			// on the first hand. If a hand is live they also sit out the current one.
			if s.Table.HandNo > 0 {
				if seat := s.Table.Seats[req.Seat]; seat != nil {
					seat.OwesPost = true
					seat.PostNow = req.PostNow
					if s.Phase != poker.PhaseWaiting {
						seat.Status = poker.SeatFolded
					}
				}
			}
			_ = seatReg.Register(ctx, userID, matchKey)
			// Guest reconciliation (P7): a GUEST (no registered account) sitting at
			// a club's private/coded table is recorded so the operator can reconcile
			// their position later. They play under the operator's per-table limit
			// (WalletLimitCents); their net is read from the ledger at settle time.
			if s.ClubID != "" && s.AccessType != "public" && guest {
				_, _ = store.NewGuestSessionStore(db).Create(ctx, &store.GuestSession{
					ClubID:     s.ClubID,
					MatchID:    matchKey,
					UserID:     userID,
					Username:   username,
					LimitMinor: s.WalletLimitCents,
					BuyInMinor: buyIn,
				})
			}
			// Seat-session tracking (Tier-1 C): record this sitting for hit-and-run /
			// ratholing visibility. Rathole = re-buying short soon after leaving this
			// same table with a bigger stack. Advisory only — never blocks the sit.
			s.SeatBuyIn[req.Seat] = buyIn
			s.SeatHands[req.Seat] = 0
			ratholed := false
			if prev, _ := store.NewSeatSessionStore(db).LastClosedAtTable(ctx, matchKey, userID); prev != nil && prev.LeftAt != nil {
				if time.Since(*prev.LeftAt) < ratholeWindowSecs*time.Second && prev.StackAtLeaveMinor > buyIn {
					ratholed = true
				}
			}
			if id, err := store.NewSeatSessionStore(db).Open(ctx, &store.SeatSession{
				MatchID: matchKey, ClubID: s.ClubID, UserID: userID, Username: username,
				BuyInMinor: buyIn, Ratholed: ratholed,
			}); err == nil {
				s.SeatSessionID[req.Seat] = id
			}
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpStandUp:
			stoodUp := false
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					// Cashout-lock (#32): a player holding live cards in a live hand
					// cannot leave and pull chips from the pot. They must fold first;
					// an all-in player waits for the hand to resolve. Folded seats
					// and between-hands players leave freely.
					if s.Phase != poker.PhaseWaiting && (seat.Status == poker.SeatSeated || seat.Status == poker.SeatAllIn) {
						sendError(dispatcher, presence, "in_hand", "you can't leave mid-hand — fold first, or wait for the hand to finish")
						break
					}
					releaseBuyIn(ctx, logger, db, s, i, userID, seat.Stack)
					delete(s.SeatWallet, i)
					delete(s.SeatLocked, i)
					closeSeatSession(ctx, db, s, i)
					s.Table.StandUp(i)
					stoodUp = true
					break
				}
			}
			if !stoodUp {
				continue // blocked mid-hand or not seated — no stand-up side effects
			}
			_ = store.NewActiveSeatStore(db).Unregister(ctx, userID, matchIDForAudit(s))
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpMoveSeat:
			// Player self-move to an EMPTY seat, chip-conserving (keeps the exact
			// stack — not a re-buy). Only between hands, and never mid-hand while the
			// mover holds live cards. Tracking maps (wallet/session/buy-in) follow the
			// seat so the seat-session and cash-out wallet stay correct.
			var req protocol.MoveSeatRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				continue
			}
			if s.Phase != poker.PhaseWaiting || s.Table.Street != poker.StreetWaiting {
				sendError(dispatcher, presence, "in_hand", "you can only change seats between hands")
				continue
			}
			from := seatForUser(s, userID)
			if from < 0 {
				continue
			}
			if req.ToSeat < 0 || req.ToSeat >= poker.MaxSeats || s.Table.Seats[req.ToSeat] != nil {
				sendError(dispatcher, presence, "seat_taken", "that seat isn't open")
				continue
			}
			if err := s.Table.MoveSeat(from, req.ToSeat); err != nil {
				sendError(dispatcher, presence, "move_failed", err.Error())
				continue
			}
			moveSeatTracking(s, from, req.ToSeat)
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpSitOut:
			// Toggle sitting-out in place (keeps the seat + chips). Sitting out holds
			// the player out of the next hand; coming back owes a post (must post or
			// wait for the big blind) per the blind-correctness rules. Takes effect at
			// the next hand — a live hand plays out normally.
			var req protocol.SitOutRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				continue
			}
			seatIdx := seatForUser(s, userID)
			if seatIdx < 0 {
				continue
			}
			seat := s.Table.Seats[seatIdx]
			if req.SitOut {
				seat.SittingOut = true
			} else {
				seat.SittingOut = false
				if s.Table.HandNo > 0 {
					seat.OwesPost = true // returning player must post or wait for the BB
				}
			}
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpChatSend:
			var req protocol.ChatSendRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				continue
			}
			text := sanitizeChat(req.Text)
			if text == "" {
				continue
			}
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			broadcastChat(dispatcher, s, protocol.ChatMessage{
				UserID:   userID,
				Username: username,
				Text:     text,
				Kind:     "player",
				Seat:     seatForUser(s, userID),
				HandNo:   s.Table.HandNo,
			})

		case protocol.OpHostAction:
			if s.HostUserID == "" || (userID != s.HostUserID && !isClubAdminForTable(ctx, db, s, userID)) {
				sendError(dispatcher, presence, "not_host", "only the table host or a club admin of the sponsoring club can do that")
				continue
			}
			handleHostAction(ctx, logger, db, dispatcher, s, userID, msg.GetData())

		case protocol.OpUseTimeBank:
			seatIdx := seatForUser(s, userID)
			if seatIdx < 0 || seatIdx != s.Table.ActionSeat || s.ActionDeadlineSeat != seatIdx || s.ActionDeadlineTick == 0 {
				sendError(dispatcher, presence, "not_your_turn", "you can only extend time on your own turn")
				continue
			}
			bank := s.TimeBank[userID]
			if bank <= 0 {
				sendError(dispatcher, presence, "no_time_bank", "no time bank remaining to extend with")
				continue
			}
			s.TimeBank[userID] = 0
			s.ActionDeadlineTick += bank * 10 // ticks run 10/sec
			narrate(dispatcher, s, fmt.Sprintf("%s used their time bank to extend the clock.", displayName(s, userID)))
			broadcastActionRequired(ctx, db, dispatcher, s)

		case protocol.OpAddChips:
			seatIdx := seatForUser(s, userID)
			if seatIdx < 0 {
				sendError(dispatcher, presence, "not_seated", "sit down before adding chips")
				continue
			}
			seat := s.Table.Seats[seatIdx]
			// Table-stakes rule: a player may only add to their stack between hands,
			// not after seeing live action in a hand they're still part of — the same
			// "still live in the hand" idiom already used elsewhere in this file (e.g.
			// the kick/move-seat gates) for exactly this reason.
			if s.Phase != poker.PhaseWaiting && (seat.Status == poker.SeatSeated || seat.Status == poker.SeatAllIn) {
				sendError(dispatcher, presence, "hand_in_progress", "you can only add chips between hands")
				continue
			}
			var req struct {
				AmountCents int64 `json:"amount_cents"`
			}
			if err := json.Unmarshal(msg.GetData(), &req); err != nil || req.AmountCents <= 0 {
				sendError(dispatcher, presence, "invalid_payload", "amount_cents must be positive")
				continue
			}
			amount := req.AmountCents
			if !s.NoMaxBuyIn {
				room := s.maxBuyIn() - seat.Stack
				if room <= 0 {
					sendError(dispatcher, presence, "buyin_cap", "your stack is already at the table maximum")
					continue
				}
				if amount > room {
					amount = room
				}
			}
			if s.WalletLimitCents > 0 {
				room := s.WalletLimitCents - seat.Stack
				if room <= 0 {
					sendError(dispatcher, presence, "wallet_limit", "you're already at this table's wallet limit")
					continue
				}
				if amount > room {
					amount = room
				}
			}
			w, reserved := reserveBuyIn(ctx, db, s, userID, amount, "global", false)
			if w == "" {
				sendError(dispatcher, presence, "insufficient_funds", "not enough in your wallet to add that many chips")
				continue
			}
			seat.Stack += reserved
			s.SeatBuyIn[seatIdx] += reserved
			narrate(dispatcher, s, fmt.Sprintf("%s added $%d to their stack.", seat.Username, reserved/100))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpPostStraddle:
			if !s.Table.AllowStraddle {
				sendError(dispatcher, presence, "straddle_disabled", "straddles are not enabled at this table")
				continue
			}
			if seatForUser(s, userID) < 0 {
				sendError(dispatcher, presence, "not_seated", "sit down to post a straddle")
				continue
			}
			var req protocol.PostStraddleRequest
			_ = json.Unmarshal(msg.GetData(), &req)
			s.Table.StraddleRequested = req.Enable
			if req.Enable {
				narrate(dispatcher, s, fmt.Sprintf("%s armed a straddle for the next hand.", displayName(s, userID)))
			} else {
				narrate(dispatcher, s, "Straddle disarmed for the next hand.")
			}
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpRunItTwice:
			if !s.Table.AllowRunItTwice {
				sendError(dispatcher, presence, "rit_disabled", "run-it-twice is not enabled at this table")
				continue
			}
			if seatForUser(s, userID) < 0 {
				continue
			}
			var vote protocol.RunItTwiceVote
			_ = json.Unmarshal(msg.GetData(), &vote)
			if s.RITAgree == nil {
				s.RITAgree = map[string]bool{}
			}
			s.RITAgree[userID] = vote.Agree
			if vote.Agree {
				narrate(dispatcher, s, fmt.Sprintf("%s agrees to run it twice.", displayName(s, userID)))
			}

		case protocol.OpInsuranceAccept:
			handleInsuranceAccept(ctx, logger, db, dispatcher, s, userID, presence, msg.GetData())

		case protocol.OpStartHand:
			if s.Table.SeatedCount() >= s.minToStart() && s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
				if err := s.Table.StartHand(s.effSmallBlind(), s.effBigBlind()); err != nil {
					sendError(dispatcher, presence, "engine_unavailable", err.Error())
					continue
				}
				s.Phase = poker.PhaseBetting
				emitHandStarted(ctx, logger, s)
				narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.effSmallBlind()/100, s.effBigBlind()/100))
				broadcastHandStart(ctx, db, dispatcher, s)
				dealAndBeginBetting(ctx, logger, db, dispatcher, s)
			}

		case protocol.OpAction:
			var req protocol.ActionRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				sendError(dispatcher, presence, "invalid_payload", err.Error())
				continue
			}
			seatIdx := seatForUser(s, userID)
			if seatIdx < 0 {
				continue
			}
			// Idempotency (Tier-1 B): drop a re-sent action carrying the nonce we
			// already accepted from this player — a client retry / double-tap must
			// not apply twice. Empty nonce keeps the old behavior.
			if req.Nonce != "" && s.LastActionNonce[userID] == req.Nonce {
				continue
			}
			if err := s.Table.ApplyAction(seatIdx, req.Type, req.Amount); err != nil {
				sendError(dispatcher, presence, "action_failed", err.Error())
				continue
			}
			if req.Nonce != "" {
				s.LastActionNonce[userID] = req.Nonce
			}
			// Voluntary action clears the inactivity streak (they're present).
			if s.TimeoutStreak != nil {
				delete(s.TimeoutStreak, userID)
			}
			emitPlayerAction(ctx, logger, s, userID, req.Type, req.Amount)
			narrateAction(dispatcher, s, seatIdx, req.Type)
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

			if _, uncontested := s.Table.UncontestedWinner(); uncontested {
				beginShowdownResolution(ctx, logger, s)
				broadcastSnapshot(ctx, db, dispatcher, s, nil)
				continue
			}

			showdown := s.Table.AdvanceAction()
			if showdown {
				beginShowdownResolution(ctx, logger, s)
				broadcastSnapshot(ctx, db, dispatcher, s, nil)
			} else if s.Table.Street != poker.StreetPreflop || len(s.Table.Board) > 0 {
				if len(s.Table.Board) > 0 {
					broadcastBoard(dispatcher, s)
				}
				broadcastActionRequired(ctx, db, dispatcher, s)
			} else {
				broadcastActionRequired(ctx, db, dispatcher, s)
			}
			// If that action put a player all-in with opponents still to act, offer
			// all-in insurance (no-op unless the feature is enabled).
			if s.Phase.AllowsPlayerActions() {
				maybeOfferInsurance(ctx, db, dispatcher, s)
			}
		}
	}

	// After human input, let any bot(s) whose turn it is act.
	driveBots(ctx, logger, db, dispatcher, s)
	// Then enforce the human action clock so an AFK/disconnected player can't
	// freeze the table.
	enforceActionDeadline(ctx, logger, db, dispatcher, s, tick)
	return s
}

// enforceActionDeadline auto-acts for a human who has been sitting on their turn
// past actionTimeoutTicks (check if free, else fold), then progresses the hand
// exactly as a real action would. Bots act via driveBots and are never subject to
// this. The deadline is (re)armed the first tick a given human seat is to act.
func enforceActionDeadline(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, tick int64) {
	if s.Phase != poker.PhaseBetting {
		s.ActionDeadlineTick, s.ActionDeadlineSeat = 0, -1
		return
	}
	seatIdx := s.Table.ActionSeat
	seat := seatIdxSeat(s, seatIdx)
	if seat == nil || seat.IsBot || seat.Status != poker.SeatSeated {
		s.ActionDeadlineTick, s.ActionDeadlineSeat = 0, -1
		return
	}
	// Arm the clock the first tick this human seat is on the clock.
	if s.ActionDeadlineSeat != seatIdx || s.ActionDeadlineTick == 0 {
		s.ActionDeadlineSeat = seatIdx
		s.ActionDeadlineTick = tick + s.actionTicks()
		return
	}
	if tick < s.ActionDeadlineTick {
		return
	}
	// Base clock lapsed — burn one second of the player's time bank (if any)
	// before folding for them, extending the deadline a second at a time.
	if s.TimeBank[seat.UserID] > 0 {
		s.TimeBank[seat.UserID]--
		s.ActionDeadlineTick = tick + 10 // one more second on the bank (10 ticks/s)
		return
	}
	// Time's up — act for them.
	_, toCall, _, _ := s.Table.ValidActions(seatIdx)
	action := "fold"
	if toCall == 0 {
		action = "check"
	}
	if err := s.Table.ApplyAction(seatIdx, action, 0); err != nil {
		return
	}
	s.ActionDeadlineTick, s.ActionDeadlineSeat = 0, -1
	emitPlayerAction(ctx, logger, s, seat.UserID, action, 0)
	narrateAction(dispatcher, s, seatIdx, action)
	// Inactivity auto-kick (#86): count consecutive server-acted timeouts. The
	// actual stand-up is deferred to standUpBusted (between hands) so removing a
	// seat never corrupts an in-flight hand's side-pot/showdown state.
	if s.TimeoutStreak == nil {
		s.TimeoutStreak = map[string]int{}
	}
	s.TimeoutStreak[seat.UserID]++
	// Auto-away on 2x timeout (tournament-scoped, operator-configured). Marking
	// the seat SittingOut is safe mid-hand: the table only consults the flag when
	// choosing who is dealt in next hand, so the current hand still resolves with
	// this seat's folded/checked action intact. Standing them up here would
	// forfeit a tournament stack, which is why the cash-table auto-kick is not
	// reused for this.
	if s.AutoAwayOnTimeout && !seat.SittingOut && s.TimeoutStreak[seat.UserID] >= autoAwayTimeoutStreak {
		seat.SittingOut = true
		narrate(dispatcher, s, fmt.Sprintf("%s was sat out after %d consecutive time-outs.", seat.Username, autoAwayTimeoutStreak))
	}
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	if _, uncontested := s.Table.UncontestedWinner(); uncontested {
		beginShowdownResolution(ctx, logger, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	if s.Table.AdvanceAction() {
		beginShowdownResolution(ctx, logger, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	if len(s.Table.Board) > 0 {
		broadcastBoard(dispatcher, s)
	}
	broadcastActionRequired(ctx, db, dispatcher, s)
	// A bot may now be first to act on the new street.
	driveBots(ctx, logger, db, dispatcher, s)
}

// seatIdxSeat safely returns the seat at idx (nil if out of range/empty).
func seatIdxSeat(s *MatchState, idx int) *poker.Seat {
	if idx < 0 || idx >= poker.MaxSeats {
		return nil
	}
	return s.Table.Seats[idx]
}

// driveBots plays out consecutive bot turns during the betting phase. Bot hand
// strength comes from rs_poker (engine-math) inside bot.Decide; the loop applies
// each decision through the same table logic a human action uses.
func driveBots(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	for guard := 0; guard < poker.MaxSeats*4; guard++ {
		if !s.Phase.AllowsPlayerActions() {
			return
		}
		seatIdx := s.Table.ActionSeat
		if seatIdx < 0 {
			return
		}
		seat := s.Table.Seats[seatIdx]
		if seat == nil || !seat.IsBot || seat.Status != poker.SeatSeated {
			return
		}

		_, toCall, minRaise, maxRaise := s.Table.ValidActions(seatIdx)
		hole, ok := s.Table.HoleCards[seat.UserID]
		action, amount := "check", int64(0)
		if toCall > 0 {
			action = "fold"
		}
		if ok && len(hole) >= 2 {
			// Bots reason over the first two cards as a rough proxy (fine for both
			// Hold'em and PLO; PLO-optimal bot play is a later refinement).
			holeStr := hole[0].Code() + hole[1].Code()
			if d, err := bot.Decide(holeStr, boardCodes(s.Table.Board), toCall, s.Table.Pot, minRaise, maxRaise, seat.Stack, s.Rand); err == nil {
				action, amount = d.Action, d.Amount
			}
		}

		if err := s.Table.ApplyAction(seatIdx, action, amount); err != nil {
			// Fall back to the safest legal action if the policy pick was illegal.
			fallback := "fold"
			if toCall == 0 {
				fallback = "check"
			}
			if err2 := s.Table.ApplyAction(seatIdx, fallback, 0); err2 != nil {
				return
			}
			action, amount = fallback, 0
		}

		emitPlayerAction(ctx, logger, s, seat.UserID, action, amount)
		narrateAction(dispatcher, s, seatIdx, action)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)

		if _, uncontested := s.Table.UncontestedWinner(); uncontested {
			beginShowdownResolution(ctx, logger, s)
			broadcastSnapshot(ctx, db, dispatcher, s, nil)
			return
		}
		if s.Table.AdvanceAction() {
			beginShowdownResolution(ctx, logger, s)
			broadcastSnapshot(ctx, db, dispatcher, s, nil)
			return
		}
		if len(s.Table.Board) > 0 {
			broadcastBoard(dispatcher, s)
		}
		broadcastActionRequired(ctx, db, dispatcher, s)
	}
}

func boardCodes(board []poker.Card) string {
	out := ""
	for _, c := range board {
		out += c.Code()
	}
	return out
}

// boardStrings renders each run-it-twice board as a concatenated card-code string
// for persistence (poker_run_it_twice.boards).
func boardStrings(boards [][]poker.Card) []string {
	out := make([]string, 0, len(boards))
	for _, b := range boards {
		out = append(out, boardCodes(b))
	}
	return out
}

func beginShowdownResolution(ctx context.Context, logger runtime.Logger, s *MatchState) {
	if s.Phase == poker.PhaseResolvingSidePots {
		return
	}
	// Decide run-it-twice before snapshotting the plan: only when enabled, the
	// board is incomplete, and every remaining player is all-in AND has agreed
	// (bots auto-agree). Otherwise the standard single-board path runs unchanged.
	s.Table.RunItTwice = shouldRunItTwice(s)
	plan := poker.BuildShowdownPlan(s.Table, matchIDForAudit(s))
	s.Phase = poker.PhaseResolvingSidePots
	s.PendingShowdown = &PendingShowdown{
		ResultCh:  poker.StartShowdownAsync(ctx, plan),
		PotBefore: s.Table.Pot,
		Plan:      plan,
	}
	emitSidePotsPlanned(ctx, logger, s, plan)
}

// shouldRunItTwice reports whether the imminent showdown should run the board
// multiple times: the feature must be enabled, the board incomplete, and every
// non-folded player must be all-in and (if human) have agreed to it.
//
// TODO(#41): the agreement is collected as a pre-commit vote during betting
// (OpRunItTwice), not via a dedicated post-all-in prompt with a decision timer.
// Adding a real vote window means a new match phase between "all-in reached" and
// showdown resolution — deliberately deferred here to avoid destabilizing the
// live showdown path. The per-board deal/split/side-pot resolution below is fully
// implemented and gated behind AllowRunItTwice.
func shouldRunItTwice(s *MatchState) bool {
	t := s.Table
	if !t.AllowRunItTwice || t.RunItTwiceBoards < 2 {
		return false
	}
	if len(t.Board) >= 5 {
		return false
	}
	remaining := t.NonFoldedSeats()
	if len(remaining) < 2 {
		return false
	}
	for _, i := range remaining {
		seat := t.Seats[i]
		if seat == nil || seat.Status != poker.SeatAllIn {
			return false // someone can still act — not an all-in runout
		}
		if !seat.IsBot && !s.RITAgree[seat.UserID] {
			return false // every human in the pot must agree
		}
	}
	return true
}

// displayName resolves a user's seat username for narration, falling back to a
// short id-derived handle.
func displayName(s *MatchState, userID string) string {
	if seat := seatForUser(s, userID); seat >= 0 && s.Table.Seats[seat] != nil {
		if n := s.Table.Seats[seat].Username; n != "" {
			return n
		}
	}
	if len(userID) >= 4 {
		return "Player_" + userID[:4]
	}
	return "Player"
}

// maybeOfferInsurance offers an all-in favorite insurance priced off live equity
// (rs_poker via enginemath.EstimateEquity), payable if they end up losing. It is
// only offered on plain cash tables (no club/tournament wallet indirection), when
// the board is incomplete, and while at least one opponent can still act — so the
// player has a betting-phase window to accept. Money never touches the pot.
//
// TODO(#41): insurance is priced ONCE at the moment of the all-in using the
// current board, and the accept window only exists while an opponent can still
// act (no window when everyone is all-in simultaneously). Per-street re-pricing
// and a formal offer/accept prompt with a timer are the remaining UX pieces; the
// pricing (real equity), wallet-side premium debit, and loss payout are complete
// and gated behind AllowInsurance.
func maybeOfferInsurance(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if !s.Table.AllowInsurance || s.ClubID != "" || s.TournamentID != "" {
		return
	}
	if len(s.Table.Board) >= 5 {
		return
	}
	remaining := s.Table.NonFoldedSeats()
	if len(remaining) < 2 {
		return
	}
	// An accept window only exists if someone who is NOT all-in can still act.
	someoneCanAct := false
	for _, i := range remaining {
		seat := s.Table.Seats[i]
		if seat != nil && seat.Status == poker.SeatSeated && seat.Stack > 0 {
			someoneCanAct = true
			break
		}
	}
	if !someoneCanAct {
		return
	}
	// Build the contesting holes in seat order for the equity call.
	holes := make([]string, 0, len(remaining))
	seatOf := make([]int, 0, len(remaining))
	for _, i := range remaining {
		seat := s.Table.Seats[i]
		hole := s.Table.HoleCards[seat.UserID]
		if len(hole) == 0 {
			return // incomplete knowledge; skip pricing this round
		}
		holes = append(holes, holeCodes(hole))
		seatOf = append(seatOf, i)
	}
	eq, err := enginemath.EstimateEquity(holes, boardCodes(s.Table.Board), 1500)
	if err != nil || len(eq) != len(holes) {
		return // engine-math unavailable: no offer (never guess equity)
	}
	for k, i := range seatOf {
		seat := s.Table.Seats[i]
		if seat == nil || seat.IsBot || seat.Status != poker.SeatAllIn {
			continue
		}
		if _, present := s.Presences[seat.UserID]; !present {
			continue
		}
		if _, offered := s.InsOffered[seat.UserID]; offered {
			continue // one offer per player per hand (MVP)
		}
		if _, accepted := s.Insurance[seat.UserID]; accepted {
			continue
		}
		q := float64(eq[k])
		if q < 0.5 {
			continue // only offer favorites protection against a bad beat
		}
		payout := seat.TotalContributed // recover their at-risk stake if they lose
		if payout <= 0 {
			continue
		}
		// Fair premium = (1-q)*payout; add a 10% house margin. Guard against a
		// premium that meets/exceeds the payout (never a sensible bet).
		premium := int64(float64(payout) * (1.0 - q) * 1.10)
		if premium <= 0 || premium >= payout {
			continue
		}
		policy := insurancePolicy{Seat: i, Premium: premium, Payout: payout, Equity: q}
		s.InsOffered[seat.UserID] = policy
		if p, ok := s.Presences[seat.UserID]; ok {
			msg, _ := json.Marshal(protocol.InsuranceOfferMessage{
				Seat:    i,
				HandNo:  s.Table.HandNo,
				Premium: premium,
				Payout:  payout,
				Equity:  q,
			})
			_ = dispatcher.BroadcastMessage(protocol.OpInsuranceOffer, msg, []runtime.Presence{p}, nil, true)
		}
	}
}

// handleInsuranceAccept debits the premium from the player's wallet and records
// the policy. Settlement (payout on loss) happens at showdown. Wallet-only: the
// live pot is never touched, so pot/side-pot invariants are unaffected.
func handleInsuranceAccept(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, userID string, presence runtime.Presence, data []byte) {
	if !s.Table.AllowInsurance {
		sendError(dispatcher, presence, "insurance_disabled", "insurance is not enabled at this table")
		return
	}
	policy, ok := s.InsOffered[userID]
	if !ok {
		sendError(dispatcher, presence, "no_offer", "no standing insurance offer")
		return
	}
	if _, already := s.Insurance[userID]; already {
		return
	}
	if err := store.NewWalletStore(db).Debit(ctx, userID, policy.Premium, "insurance_premium"); err != nil {
		sendError(dispatcher, presence, "premium_failed", err.Error())
		return
	}
	s.Insurance[userID] = policy
	delete(s.InsOffered, userID)
	// The premium is already debited and the policy is live in memory (settled
	// off s.Insurance, not this row) — a failure here only loses the audit
	// trail, not the payout. Still logged: an accepted policy with no DB record
	// is exactly the kind of gap a later reconciliation needs to be told about.
	if err := store.NewInsuranceStore(db).RecordAccepted(ctx, matchIDForAudit(s), s.Table.HandNo, userID, policy.Premium, policy.Payout, policy.Equity); err != nil {
		logger.Error("insurance policy accepted but not recorded match=%s hand=%d user=%s: %v",
			matchIDForAudit(s), s.Table.HandNo, userID, err)
	}
	narrate(dispatcher, s, fmt.Sprintf("%s took insurance on their all-in.", displayName(s, userID)))
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

// settleInsurance pays out accepted policies whose holder lost the hand and marks
// every policy resolved. Called at showdown before seats reset, using the winner
// seats from the resolution. Wallet-only; independent of pot settlement.
func settleInsurance(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, res poker.ShowdownResult) {
	if len(s.Insurance) == 0 {
		return
	}
	won := map[int]bool{}
	for _, r := range res.Resolutions {
		for _, seat := range r.Winners {
			won[seat] = true
		}
	}
	ins := store.NewInsuranceStore(db)
	for userID, policy := range s.Insurance {
		seat := seatForUser(s, userID)
		playerWon := seat >= 0 && won[seat]
		if !playerWon {
			// Lost the hand — pay the insurance payout to their wallet. The record
			// is marked settled regardless of whether the credit lands, so a
			// failure here has no retry: the policy reads "resolved" forever and
			// the player is simply out the payout they paid a premium for.
			if err := store.NewWalletStore(db).Credit(ctx, userID, policy.Payout, "insurance_payout"); err != nil {
				logger.Error("INSURANCE PAYOUT FAILED match=%s hand=%d user=%s amount_cents=%d: %v",
					matchIDForAudit(s), s.Table.HandNo, userID, policy.Payout, err)
			}
			_ = ins.Settle(ctx, matchIDForAudit(s), s.Table.HandNo, userID, true)
		} else {
			_ = ins.Settle(ctx, matchIDForAudit(s), s.Table.HandNo, userID, false)
		}
	}
}

// holeCodes concatenates a player's hole cards into an engine-math card string.
func holeCodes(hole []poker.Card) string {
	out := ""
	for _, c := range hole {
		out += c.Code()
	}
	return out
}

func pollPendingShowdown(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, nk runtime.NakamaModule, s *MatchState) bool {
	if s.PendingShowdown == nil {
		return false
	}
	select {
	case res := <-s.PendingShowdown.ResultCh:
		plan := s.PendingShowdown.Plan
		potBefore := s.PendingShowdown.PotBefore
		s.PendingShowdown = nil

		if res.Err != nil {
			// A showdown-resolution error must NEVER leave the table stuck in
			// PhaseBetting (nobody can act → the whole table hangs). Refund every
			// contributor their chips and reset to waiting so play continues.
			logger.Error("showdown failed, refunding pot and resetting: %v", res.Err)
			for _, seat := range s.Table.Seats {
				if seat != nil && seat.TotalContributed > 0 {
					seat.Stack += seat.TotalContributed
				}
			}
			s.Table.Pot = 0
			for _, p := range s.Presences {
				sendError(dispatcher, p, "showdown_failed", res.Err.Error())
			}
			s.Table.ResetBetweenHands()
			standUpBusted(ctx, logger, db, dispatcher, s)
			evictExcluded(ctx, logger, db, dispatcher, s)
			evictBannedOrKicked(ctx, logger, db, dispatcher, s)
			s.Phase = poker.PhaseWaiting
			return true
		}

		winners, _ := poker.ApplyResolutions(s.Table, res.Resolutions)
		// Rake comes OUT of the pot: credit the club, then deduct that same amount
		// from the winners' stacks so total chips are conserved (Σ player nets ==
		// −rake) rather than the club's rake being minted on top of a full payout.
		rakeAmount := creditRake(ctx, logger, db, s, potBefore)
		poker.DeductRakeFromWinners(s.Table, res.Resolutions, rakeAmount)
		if err := emitHandSettled(ctx, s, res, potBefore, plan); err != nil {
			logger.Error("audit hand_settled: %v", err)
		}
		if err := broadcastShowdownFromResult(ctx, db, dispatcher, s, winners, res, potBefore); err != nil {
			logger.Error("broadcast showdown: %v", err)
		}
		recordWinnings(ctx, nk, s, res)
		accrueLoyalty(ctx, db, nk, s, res) // HRP + achievements (before seats reset)
		// Tournament eliminations: record finish places for busted seats and, in a
		// knockout event, pay the eliminator the busted player's head bounty. Runs
		// while seats still carry this hand's stacks/winners.
		processTournamentEliminations(ctx, logger, db, s, winners)
		// Run-it-twice: persist the dealt boards (audit/replay). All-in insurance:
		// pay out policies whose holder lost. Both run before ResetBetweenHands
		// while seat/winner state is still intact; both are wallet/record only and
		// never touch the settled pot.
		if len(res.Boards) > 0 {
			_ = store.NewRunItTwiceStore(db).Record(ctx, matchIDForAudit(s), s.Table.HandNo, boardStrings(res.Boards))
		}
		settleInsurance(ctx, logger, db, s, res)
		// Per-hand analytics + mission progress (best-effort; must not break the
		// match loop). Uses seat state before ResetBetweenHands clears it.
		attributeHand(ctx, logger, db, s, res, plan, potBefore, rakeAmount)
		accrueCompetition(ctx, logger, db, s, potBefore)
		// Tally hands played this sitting for each seated human (Tier-1 C), before
		// ResetBetweenHands clears per-hand state. Feeds the hit-and-run flag.
		for i, seat := range s.Table.Seats {
			if seat != nil && !seat.IsBot {
				s.SeatHands[i]++
			}
		}
		s.Table.ResetBetweenHands()
		reportTournamentBusts(ctx, db, nk, s)
		standUpBusted(ctx, logger, db, dispatcher, s) // cash tables: clear felted players so the table stays playable
		evictExcluded(ctx, logger, db, dispatcher, s) // RG: remove players who self-excluded mid-session (#95)
		evictBannedOrKicked(ctx, logger, db, dispatcher, s)
		s.Phase = poker.PhaseWaiting
		return true
	default:
		return false
	}
}

// accrueCompetition fans a settled hand into club-war / league standings when the
// table is tagged for one (war_id / league_id match params). The club-war delta is
// the pot contested this hand — a volume-based contribution metric, so a club whose
// war tables run bigger/more action advances its war score. League accrual is one
// activity point per settled hand. Per-seat club resolution is intentionally
// avoided: a war/league table belongs to s.ClubID, so the whole table's activity
// accrues to that club. Best-effort — a standings write must never break the loop.
func accrueCompetition(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, potBefore int64) {
	if s.ClubID == "" || potBefore <= 0 {
		return
	}
	if s.WarID != "" {
		if err := store.NewClubWarStore(db).AddHand(ctx, &store.ClubWarHand{
			WarID:   s.WarID,
			MatchID: matchIDForAudit(s),
			HandNo:  s.Table.HandNo,
			ClubID:  s.ClubID,
			Delta:   potBefore,
		}); err != nil {
			logger.Warn("club-war accrual: %v", err)
		}
	}
	if s.LeagueID != "" {
		if err := store.NewLeagueStore(db).AccrueStanding(ctx, s.LeagueID, s.ClubID, 1, 0, 0); err != nil {
			logger.Warn("league accrual: %v", err)
		}
	}
}

// autoStartHand deals the next hand on a self-managing cash table (mirrors the
// manual OpStartHand path). Bots are driven by the loop's trailing driveBots.
func autoStartHand(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if s.Table.SeatedCount() < 2 || s.Phase != poker.PhaseWaiting || s.Table.Street != poker.StreetWaiting {
		return
	}
	// The host's "Auto-Away if Players Below N" floor. Unlike MinPlayers this
	// applies for the life of the table, not just its first hand.
	if s.autoAwayHoldsHand() {
		return
	}
	if err := s.Table.StartHand(s.effSmallBlind(), s.effBigBlind()); err != nil {
		// engine-math (dealer service) unreachable — no chips were committed
		// (blinds post only after a successful shuffle). Pause dealing gracefully
		// and tell players once; the loop keeps retrying and auto-resumes when the
		// service returns. No local shuffle fallback (Golden rule 4).
		if !s.DealerDown {
			s.DealerDown = true
			narrate(dispatcher, s, "Dealing paused — the dealer service is briefly unavailable. Hands resume automatically; no chips are at risk.")
		}
		return
	}
	if s.DealerDown {
		s.DealerDown = false
		narrate(dispatcher, s, "Dealer service restored — dealing resumed.")
	}
	s.Phase = poker.PhaseBetting
	emitHandStarted(ctx, logger, s)
	narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.effSmallBlind()/100, s.effBigBlind()/100))
	broadcastHandStart(ctx, db, dispatcher, s)
	dealAndBeginBetting(ctx, logger, db, dispatcher, s)
}

// dealAndBeginBetting sends hole cards and opens the first betting round. It also
// covers the bomb-pot case, where StartHand has already dealt the flop (so the
// board must be broadcast) and — in the rare event every seated player is all-in
// for the ante — advances straight to showdown resolution.
func dealAndBeginBetting(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	dealPrivateCards(dispatcher, s)
	if len(s.Table.Board) > 0 { // bomb pot: flop is already out
		broadcastBoard(dispatcher, s)
	}
	if s.Table.ActionSeat < 0 {
		beginShowdownResolution(ctx, logger, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	broadcastActionRequired(ctx, db, dispatcher, s)
}

// handleHostAction applies a host-or-club-admin table control. Blind changes
// take effect between hands; pause stops new hands being auto-dealt; kick stands
// a player up (refunding their stack). The caller has already verified the sender
// is the host or a club admin of the sponsoring club (dispatch gate above,
// isClubAdminForTable); "close" is further restricted to the host alone
// (callerID check below) — a club admin shouldn't be able to shut down someone
// else's table.
func handleHostAction(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, callerID string, data []byte) {
	var req struct {
		Action     string `json:"action"`
		Seat       int    `json:"seat"`
		ToSeat     int    `json:"to_seat"`
		SmallBlind int64  `json:"small_blind"`
		BigBlind   int64  `json:"big_blind"`
		Ante       int64  `json:"ante"`
		// Comprehensive live table settings (Admin overlay "table_settings").
		AnteOn           bool  `json:"ante_on"`
		AnteCents        int64 `json:"ante_cents"`
		TurnTimeSecs     int   `json:"turn_time_secs"`
		DecisionSecs     int   `json:"decision_secs"`
		TimeBankSecs     int64 `json:"time_bank_secs"`
		BuyInMinCents    int64 `json:"buy_in_min_cents"`
		BuyInMaxCents    int64 `json:"buy_in_max_cents"`
		WalletLimitCents int64 `json:"wallet_limit_cents"`
		SpectatorMode    bool  `json:"spectator_mode"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}
	switch req.Action {
	case "bomb_pot":
		if !s.Table.AllowBombPot {
			return
		}
		if req.Ante > 0 {
			s.Table.BombPotAnte = req.Ante
		}
		s.Table.BombPotRequested = true
		ante := s.Table.BombPotAnte
		if ante <= 0 {
			ante = s.BigBlind
		}
		narrate(dispatcher, s, fmt.Sprintf("Host called a BOMB POT — every player antes $%d and the hand deals straight to the flop.", ante/100))
	case "pause":
		s.HostPaused = true
		s.NextDealTick = 0
		narrate(dispatcher, s, "Host paused the table — no new hands will be dealt.")
	case "resume":
		s.HostPaused = false
		narrate(dispatcher, s, "Host resumed the table.")
	case "close":
		// Ending the whole table is reserved for the actual table host, not any
		// club admin who happens to also pass the OpHostAction gate above — a
		// delegate shouldn't be able to shut down someone else's table.
		if callerID != s.HostUserID {
			return
		}
		s.HostClosed = true
		narrate(dispatcher, s, "Host is closing the table…")
	case "kick":
		seat := s.Table.Seats[req.Seat]
		if req.Seat >= 0 && req.Seat < poker.MaxSeats && seat != nil && !seat.IsBot {
			// Same cashout-lock OpStandUp already enforces on a voluntary leave,
			// applied here for the same reason. Without it: a seat kicked while
			// SeatAllIn has Stack == 0 (their stake is in TotalContributed, in
			// the live pot, not at the seat) — releaseBuyIn returns nothing
			// because there is nothing at the seat to return, StandUp nils the
			// seat, and BuildSidePots only sums TotalContributed for seats that
			// still exist in t.Seats. Their entire stake — money already in the
			// pot, not the empty seat — vanishes: never paid to them, never
			// reaching another player, never reaching the house. This is
			// reachable within a single tick if a kick and the action that
			// resolves the hand land in the same message batch, ahead of the
			// PhaseResolvingSidePots gate that blocks a kick once resolution has
			// already started.
			if s.Phase != poker.PhaseWaiting && (seat.Status == poker.SeatSeated || seat.Status == poker.SeatAllIn) {
				if s.PendingKickSeats == nil {
					s.PendingKickSeats = map[int]bool{}
				}
				s.PendingKickSeats[req.Seat] = true
				narrate(dispatcher, s, fmt.Sprintf(
					"Host tried to remove %s, but they're still live in this hand — the kick will apply once it finishes.",
					seat.Username))
				break
			}
			applyKick(ctx, logger, db, dispatcher, s, req.Seat)
		}
	case "set_blinds":
		if req.SmallBlind > 0 && req.BigBlind >= req.SmallBlind {
			s.SmallBlind = req.SmallBlind
			s.BigBlind = req.BigBlind
			narrate(dispatcher, s, fmt.Sprintf("Host set blinds to $%d/$%d (from the next hand).", req.SmallBlind/100, req.BigBlind/100))
		}
	case "table_settings":
		// Apply the Admin overlay's Comprehensive Table Settings live. Previously
		// this action was unhandled, so every field below silently no-op'd (a
		// "face without flow"). Blinds still arrive via set_blinds; here we apply
		// the rest to fields with a server-side home. Behavioural-only toggles
		// (deal-to-away, reveal-all, showdown pacing) are not yet consumed and are
		// intentionally omitted rather than faked.
		clampHost := func(v int) int {
			if v < 0 {
				return 0
			}
			if v > 120 {
				return 120
			}
			return v
		}
		if req.AnteOn {
			s.Ante = req.AnteCents
		} else {
			s.Ante = 0
		}
		if req.DecisionSecs > 0 {
			s.ActionSecsCfg = clampHost(req.DecisionSecs)
		} else if req.TurnTimeSecs > 0 {
			s.ActionSecsCfg = clampHost(req.TurnTimeSecs)
		}
		if req.TimeBankSecs > 0 {
			s.TimeBankGrant = req.TimeBankSecs
		}
		if req.BuyInMinCents > 0 {
			s.MinBuyIn = req.BuyInMinCents
		}
		if req.BuyInMaxCents > 0 && req.BuyInMaxCents >= s.MinBuyIn {
			s.MaxBuyIn = req.BuyInMaxCents
		}
		if req.WalletLimitCents >= 0 {
			s.WalletLimitCents = req.WalletLimitCents
		}
		s.AllowSpectators = req.SpectatorMode
		narrate(dispatcher, s, "Host updated the table settings.")
		dispatcher.MatchLabelUpdate(buildLabel(s))
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "force_fold":
		// Fold the seat currently on the clock (dispute / stalling / disconnect).
		// Only the acting seat can be folded without corrupting hand state.
		if s.Phase == poker.PhaseBetting && s.Table.ActionSeat == req.Seat {
			seat := seatIdxSeat(s, req.Seat)
			if seat != nil && !seat.IsBot {
				if err := s.Table.ApplyAction(req.Seat, "fold", 0); err == nil {
					s.ActionDeadlineTick, s.ActionDeadlineSeat = 0, -1
					emitPlayerAction(ctx, logger, s, seat.UserID, "fold", 0)
					narrate(dispatcher, s, fmt.Sprintf("Host folded %s's hand.", seat.Username))
					broadcastSnapshot(ctx, db, dispatcher, s, nil)
					if _, uncontested := s.Table.UncontestedWinner(); uncontested {
						beginShowdownResolution(ctx, logger, s)
					} else if s.Table.AdvanceAction() {
						beginShowdownResolution(ctx, logger, s)
					} else {
						broadcastActionRequired(ctx, db, dispatcher, s)
					}
					broadcastSnapshot(ctx, db, dispatcher, s, nil)
				}
			}
		}
	case "move_seat":
		// Relocate a player to an empty seat, between hands only, preserving their
		// exact stack (chip-conserving MoveSeat, not a re-buy).
		if s.Phase == poker.PhaseWaiting {
			from := seatIdxSeat(s, req.Seat)
			if from != nil && !from.IsBot && req.ToSeat >= 0 && req.ToSeat < poker.MaxSeats && s.Table.Seats[req.ToSeat] == nil {
				name := from.Username
				if err := s.Table.MoveSeat(req.Seat, req.ToSeat); err == nil {
					moveSeatTracking(s, req.Seat, req.ToSeat)
					narrate(dispatcher, s, fmt.Sprintf("Host moved %s to seat %d.", name, req.ToSeat+1))
				}
			}
		}
	}
	dispatcher.MatchLabelUpdate(buildLabel(s))
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

// closeTable ends a self-managing table: refunds every seated human's remaining
// stack to their wallet, clears their active-seat registration, and tells the
// room. Called only between hands, so no chips are tied up in a live pot.
func closeTable(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, reason string) {
	seatReg := store.NewActiveSeatStore(db)
	for i, seat := range s.Table.Seats {
		if seat == nil {
			continue
		}
		if !seat.IsBot {
			releaseBuyIn(ctx, logger, db, s, i, seat.UserID, seat.Stack)
			delete(s.SeatWallet, i)
			delete(s.SeatLocked, i)
			_ = seatReg.Unregister(ctx, seat.UserID, matchIDForAudit(s))
		}
		closeSeatSession(ctx, db, s, i)
		s.Table.StandUp(i)
	}
	narrate(dispatcher, s, "Table closed — "+reason+". Remaining chips returned to your wallet.")
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	if integrations.DailyConfigured() {
		integrations.DeleteRoom(ctx, matchIDForAudit(s))
	}
	if s.AIHostSessionID != "" {
		_ = integrations.StopAgentSession(ctx, s.AIHostSessionID)
	}
}

func matchIDForAudit(s *MatchState) string {
	if s.MatchID != "" {
		return s.MatchID
	}
	return s.RoomID
}

func emitHandStarted(ctx context.Context, logger runtime.Logger, s *MatchState) {
	// Start a fresh per-hand behavioural tracker (VPIP/PFR/AF derivation).
	s.HandTrack = map[string]*playerHandTrack{}
	// Composite time bank: top every seated human up by the per-hand increment.
	s.refillTimeBanks()
	// Clear per-hand table-feature state (run-it-twice votes, insurance offers).
	s.RITAgree = map[string]bool{}
	s.Insurance = map[string]insurancePolicy{}
	s.InsOffered = map[string]insurancePolicy{}
	if s.Audit == nil {
		return
	}
	boardCodes := make([]string, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		boardCodes = append(boardCodes, c.Code())
	}
	payload := map[string]any{
		"hand_no":          s.Table.HandNo,
		"small_blind":      s.effSmallBlind(),
		"big_blind":        s.effBigBlind(),
		"seated":           s.Table.SeatedCount(),
		"board":            boardCodes,
		"deck_commit_hash": s.Table.DeckCommitment,
	}
	// hand_started carries the deck commitment (deck_commit_hash) — the
	// pre-deal promise a hand can later be checked against. Miss this event and
	// AuditVerifyHand can never confirm this hand's deck was fair, permanently:
	// there is no way to reconstruct a commitment that was never recorded.
	if err := s.Audit.Emit(ctx, audit.Event{
		Type:        "hand_started",
		MatchID:     matchIDForAudit(s),
		HandNo:      s.Table.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	}); err != nil {
		logger.Error("audit hand_started not recorded match=%s hand=%d: %v",
			matchIDForAudit(s), s.Table.HandNo, err)
	}
}

func emitSidePotsPlanned(ctx context.Context, logger runtime.Logger, s *MatchState, plan poker.ShowdownPlan) {
	if s.Audit == nil {
		return
	}
	layers := make([]map[string]any, 0, len(plan.Pots))
	for i, pot := range plan.Pots {
		layers = append(layers, map[string]any{
			"index":    i,
			"amount":   pot.Amount,
			"eligible": pot.Eligible,
		})
	}
	payload := map[string]any{
		"hand_no":            plan.HandNo,
		"total_pot":          plan.TotalPot,
		"side_pots":          layers,
		"uncontested_winner": plan.UncontestedWinner,
	}
	if err := s.Audit.Emit(ctx, audit.Event{
		Type:        "sidepots_planned",
		MatchID:     matchIDForAudit(s),
		HandNo:      plan.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	}); err != nil {
		logger.Error("audit sidepots_planned not recorded match=%s hand=%d: %v",
			matchIDForAudit(s), plan.HandNo, err)
	}
}

func emitHandSettled(ctx context.Context, s *MatchState, res poker.ShowdownResult, potBefore int64, plan poker.ShowdownPlan) error {
	if s.Audit == nil {
		return nil
	}
	payouts := make([]map[string]any, 0, len(res.Resolutions))
	for _, r := range res.Resolutions {
		payouts = append(payouts, map[string]any{
			"pot_index": r.PotIndex,
			"amount":    r.Amount,
			"winners":   r.Winners,
			"hands":     r.HandCats,
		})
	}
	boardCodes := make([]string, 0, len(plan.Board))
	for _, c := range plan.Board {
		boardCodes = append(boardCodes, c.Code())
	}
	payload := map[string]any{
		"hand_no":          s.Table.HandNo,
		"pot":              potBefore,
		"payouts":          payouts,
		"board":            boardCodes,
		"engine":           "rs_poker",
		"deck_order":       plan.DeckOrder,
		"deck_commit_hash": plan.DeckCommitment,
		"reveal_seed":      plan.DeckSeed, // revealed now: re-run the shuffle to verify
	}
	return s.Audit.Emit(ctx, audit.Event{
		Type:        "hand_settled",
		MatchID:     matchIDForAudit(s),
		HandNo:      s.Table.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	})
}

func emitPlayerAction(ctx context.Context, logger runtime.Logger, s *MatchState, userID, action string, amount int64) {
	trackAction(s, userID, action)
	recordAntibotAction(s, userID, action, amount)
	if s.Audit == nil {
		return
	}
	pot := s.Table.Pot
	if pot <= 0 {
		pot = 1
	}
	payload := map[string]any{
		"hand_no":   s.Table.HandNo,
		"user_id":   userID,
		"action":    action,
		"amount":    amount,
		"pot_ratio": float64(amount) / float64(pot),
		"street":    string(s.Table.Street),
	}
	if err := s.Audit.Emit(ctx, audit.Event{
		Type:        "player_action",
		MatchID:     matchIDForAudit(s),
		HandNo:      s.Table.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	}); err != nil {
		logger.Error("audit player_action not recorded match=%s hand=%d user=%s: %v",
			matchIDForAudit(s), s.Table.HandNo, userID, err)
	}
}

func (s *MatchState) minBuyIn() int64 {
	if s.MinBuyIn > 0 {
		return s.MinBuyIn
	}
	return s.BuyIn
}

func (s *MatchState) maxBuyIn() int64 {
	if s.MaxBuyIn > 0 {
		return s.MaxBuyIn
	}
	if s.BuyIn > 0 {
		return s.BuyIn * 3
	}
	return s.BuyIn
}

// clubAcceptsGlobal reports whether a club lets players buy in with the funded
// global wallet (in addition to the club-issued balance).
func clubAcceptsGlobal(ctx context.Context, db *sql.DB, clubID string) bool {
	c, err := store.NewClubStore(db).GetByID(ctx, clubID)
	return err == nil && c != nil && c.AcceptsGlobalWallet
}

// reserveBuyIn debits the chosen wallet and returns which wallet was used
// ("global" | "club" | "tournament") plus the EXACT amount actually reserved
// (post-ClampBuyInBand — never the raw `amount` argument), or ("", 0) on
// failure (insufficient funds). At a club table the club-issued balance is
// used unless the player picked "global" AND the club accepts it.
// reserveBuyIn reserves a player's buy-in. HRC certification rule: CASH GAMES are
// GLOBAL-WALLET ONLY — every registered player buys into a cash table with their
// funded, KYC-verified global wallet, never club-allocated chips, whether the
// table was stood up by a club owner or a sponsor. Club-allocated chips are only
// for GUESTS / comps at coded tables (tracked for operator reconciliation, #P7).
// Tournaments are director-managed (no wallet debit here). The player's `wallet`
// preference no longer selects the source for registered players — the rule does.
//
// Callers MUST use the returned amount (not their own raw `amount` argument)
// for anything downstream that has to match what was actually reserved —
// the seat stack, MatchState.SeatLocked, and any failure-path release. Passing
// the raw argument back to those instead diverges from what this function
// actually reserved whenever it fell below MinBuyInCents (only enforced on
// NoMaxBuyIn tables, since capped tables pre-clamp the raw amount before it
// ever reaches here) — mismatched by exactly that shortfall, either destroying
// it (a failure-path refund of the raw, smaller amount) or stranding it forever
// (a club lock recorded at the raw, smaller amount that a later release can
// never fully unwind).
func reserveBuyIn(ctx context.Context, db *sql.DB, s *MatchState, userID string, amount int64, wallet string, guest bool) (string, int64) {
	// s.NoMaxBuyIn, not the unconditional global cap: this used to hard-clamp
	// every buy-in to poker.MaxBuyInCents ($1,000) regardless of the table's own
	// "Unlimited buy-in (play money)" setting, silently downsizing every buy-in
	// on a table configured for exactly the opposite. NoMaxBuyIn can never be
	// true on a real-money table (gated at match init on realMoneyEnabled()), so
	// this only relaxes the cap where the table already can't move real money.
	amount = poker.ClampBuyInBand(amount, s.NoMaxBuyIn)
	if s.TournamentID != "" {
		return "tournament", amount // director-managed; no wallet debit
	}
	if s.ClubID != "" && guest {
		// Guest / comp seat only: club-allocated chips, under the operator's limit.
		if err := store.NewClubStore(db).LockBalanceForTable(ctx, s.ClubID, userID, amount, matchIDForAudit(s)); err != nil {
			return "", 0
		}
		return "club", amount
	}
	// Registered player (club or non-club table) = certified cash game → the
	// global wallet only. No club-chip fallback; a funded global wallet is required.
	// The table is the counterparty, not a generic house bucket: chips move onto
	// the felt and come back off it, so table:<matchID> is the live count of what
	// is in play and returns to zero when the last seat empties.
	if err := store.NewWalletStore(db).DebitTo(ctx, userID, amount, "table_buyin",
		store.TableAcct(matchIDForAudit(s))); err != nil {
		return "", 0
	}
	return "global", amount
}

// releaseBuyIn returns chips to the SAME wallet the seat bought in from.
//
// This is the game's cash-out path — every stand-up, kick, table close,
// inactivity eviction, and RG eviction returns a player's stack through here.
// Both branches used to discard their error entirely: if the credit failed,
// s.Table.StandUp still ran, the seat emptied, and the player's chips were
// gone from the table with no record anywhere that they were owed anything.
// There is no natural retry at this point — the in-memory stack the amount
// came from no longer exists once this function returns — so logging loudly
// is the least this can do; it is what makes the loss findable and
// compensable instead of just gone.
func releaseBuyIn(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, seat int, userID string, amount int64) {
	wallet := ""
	if s.SeatWallet != nil {
		wallet = s.SeatWallet[seat]
	}
	locked := amount
	if s.SeatLocked != nil {
		if v, ok := s.SeatLocked[seat]; ok {
			locked = v
		}
	}
	releaseBuyInAs(ctx, logger, db, s, userID, wallet, locked, amount)
}

// releaseBuyInAs is releaseBuyIn's actual implementation, taking the wallet
// type and locked amount explicitly instead of reading them from
// MatchState.SeatWallet/SeatLocked. Use this directly (not releaseBuyIn) at
// any point where a reservation is being released BEFORE it was ever recorded
// into those seat-indexed maps — e.g. OpSitDown's own sitErr-!=-nil path,
// which used to call releaseBuyIn and silently read whatever stale/empty
// value SeatWallet[seat] already held (never "club", since this attempt never
// got that far), crediting the wrong wallet — the player's global balance was
// minted from nothing while their real club-locked reservation stayed stuck
// in locked_amount forever, un-owned by any seat.
func releaseBuyInAs(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, userID, wallet string, locked, amount int64) {
	if amount <= 0 || s.TournamentID != "" {
		return
	}
	if wallet == "club" && s.ClubID != "" {
		// Unlock what was reserved; credit what is actually leaving. Passing the
		// stack for both — the old behaviour — pinned a losing player's shortfall
		// in locked_amount permanently.
		if err := store.NewClubStore(db).SettleSeatAtTable(ctx, s.ClubID, userID, locked, amount, matchIDForAudit(s)); err != nil {
			logger.Error("CASHOUT FAILED match=%s club=%s user=%s amount_cents=%d: %v",
				matchIDForAudit(s), s.ClubID, userID, amount, err)
		}
		return
	}
	// "global", non-club tables, or unknown -> the global wallet.
	if err := store.NewWalletStore(db).CreditFrom(ctx, userID, amount, "table_cashout",
		store.TableAcct(matchIDForAudit(s))); err != nil {
		logger.Error("CASHOUT FAILED match=%s user=%s amount_cents=%d: %v",
			matchIDForAudit(s), userID, amount, err)
	}
}

// creditRake credits the club's rake ledger and accrues rakeback, returning the
// rake amount so the caller can deduct it from the pot the winners received
// (rake must come OUT of the pot — winners get pot − rake — or chips are minted).
func creditRake(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, pot int64) int64 {
	if s.ClubID == "" || pot <= 0 {
		return 0
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, s.ClubID)
	if err != nil || rake == nil {
		return 0
	}
	if rake.NoFlopNoDrop && len(s.Table.Board) == 0 {
		return 0
	}
	if pot < rake.MinPotMinor {
		return 0
	}
	rakeAmount := pot * int64(rake.PercentBps) / 10000
	if rake.CapMinor > 0 && rakeAmount > rake.CapMinor {
		rakeAmount = rake.CapMinor
	}
	if rakeAmount <= 0 {
		return 0
	}
	// The caller deducts rakeAmount from the winners' stacks unconditionally
	// (DeductRakeFromWinners, right after this returns) — the pot math assumes
	// the rake was actually credited to the club. If it wasn't, chips vanish
	// from the table's books: taken from the winners, never landing anywhere,
	// breaking the exact money-conservation invariant this comment's sibling
	// function (poker.DeductRakeFromWinners) exists to preserve.
	if err := store.NewRakeStore(db).Credit(ctx, s.ClubID, rakeAmount, s.MatchID, s.Table.HandNo); err != nil {
		logger.Error("RAKE CREDIT FAILED match=%s club=%s hand=%d amount_cents=%d (still deducted from winners): %v",
			s.MatchID, s.ClubID, s.Table.HandNo, rakeAmount, err)
	}
	accrueRakeback(ctx, logger, db, s, rakeAmount)
	return rakeAmount
}

// accrueRakeback distributes rakeback to the human contributors of the raked
// pot, proportional to each one's contribution, at their membership tier's
// rakeback percent. Bots (no tier) are skipped.
func accrueRakeback(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, rakeAmount int64) {
	var totalContrib int64
	for _, seat := range s.Table.Seats {
		if seat != nil {
			totalContrib += seat.TotalContributed
		}
	}
	if totalContrib <= 0 {
		return
	}
	rb := store.NewRakebackStore(db)
	for _, seat := range s.Table.Seats {
		if seat == nil || seat.UserID == "" || seat.IsBot || seat.TotalContributed <= 0 {
			continue
		}
		pct := billing.GetTierDef(store.SubscriptionTier(ctx, db, seat.UserID)).RakebackPercent
		if pct <= 0 {
			continue
		}
		share := rakeAmount * seat.TotalContributed / totalContrib
		amount := share * int64(pct) / 100
		if amount > 0 {
			if err := rb.Accrue(ctx, seat.UserID, amount); err != nil {
				logger.Error("rakeback accrual failed match=%s user=%s amount_cents=%d: %v",
					s.MatchID, seat.UserID, amount, err)
			}
		}
	}
}

// recordWinnings posts each pot winner's share to the global leaderboard and
// sends them a "hand won" notification (native Nakama features).
func recordWinnings(ctx context.Context, nk runtime.NakamaModule, s *MatchState, res poker.ShowdownResult) {
	for _, r := range res.Resolutions {
		if len(r.Winners) == 0 || r.Amount <= 0 {
			continue
		}
		share := r.Amount / int64(len(r.Winners))
		if share <= 0 {
			continue
		}
		for _, seat := range r.Winners {
			if seat < 0 || seat >= len(s.Table.Seats) || s.Table.Seats[seat] == nil {
				continue
			}
			w := s.Table.Seats[seat]
			social.RecordWinnings(ctx, nk, w.UserID, w.Username, share)
			social.Notify(ctx, nk, w.UserID, "hand_won", map[string]interface{}{
				"amount":  share,
				"hand_no": s.Table.HandNo,
				"room_id": s.RoomID,
			}, social.CodeHandWon)
		}
	}
}

// accrueLoyalty awards HRP to every human who played this hand (1 base, +2 for
// winning, times their subscription-tier multiplier) and unlocks any newly-earned
// processTournamentEliminations records finish places for seats that busted this
// hand and, in a knockout tournament, pays each eliminated player's head bounty
// to the eliminator (the winning real player left with the largest stack). It is
// idempotent per elimination via TournamentStore.Eliminate (WHERE status='playing')
// and BountyStore.Claim (WHERE active), so a re-processed hand pays nothing twice.
func processTournamentEliminations(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, winnerGroups [][]int) {
	if s.TournamentID == "" {
		return
	}
	busted := false
	for _, seat := range s.Table.Seats {
		if seat != nil && seat.Stack <= 0 && seat.UserID != "" {
			busted = true
			break
		}
	}
	if !busted {
		return
	}
	ts := store.NewTournamentStore(db)
	tour, err := ts.Get(ctx, s.TournamentID)
	if err != nil || tour == nil {
		return
	}
	// Eliminator = the winning real player left with the largest stack.
	eliminator, best := "", int64(-1)
	for _, group := range winnerGroups {
		for _, idx := range group {
			if idx < 0 || idx >= len(s.Table.Seats) {
				continue
			}
			w := s.Table.Seats[idx]
			if w != nil && !w.IsBot && w.UserID != "" && w.Stack > best {
				eliminator, best = w.UserID, w.Stack
			}
		}
	}
	bs := store.NewBountyStore(db)
	ws := store.NewWalletStore(db)
	for _, seat := range s.Table.Seats {
		if seat == nil || seat.Stack > 0 || seat.UserID == "" {
			continue
		}
		place, _ := ts.CountPlaying(ctx, s.TournamentID)
		ok, _ := ts.Eliminate(ctx, s.TournamentID, seat.UserID, place)
		if !ok {
			continue // no live registration (bot/filler) or already recorded
		}
		if tour.Knockout && eliminator != "" && eliminator != seat.UserID {
			// Claim is idempotent (WHERE active) — a re-processed hand won't claim
			// this bounty again, which means a failed Credit here has no retry:
			// the bounty reads claimed and the eliminator is simply never paid.
			if amt, err := bs.Claim(ctx, s.TournamentID, seat.UserID, eliminator); err == nil && amt > 0 {
				// CreditFrom, not Credit: a bounty is carved out of the busted
				// player's OWN buy-in (armed at registration via BountyStore.SetBounty,
				// funded from the same house:tournament_buyin debit every entrant's
				// buy-in lands in) — not new money. Crediting via the default
				// house:tournament_bounty counter-account would post this payout
				// against a bucket nothing ever funds.
				if cerr := ws.CreditFrom(ctx, eliminator, amt, "tournament_bounty", "house:tournament_buyin"); cerr != nil {
					logger.Error("BOUNTY PAYOUT FAILED tournament=%s eliminator=%s busted=%s amount_cents=%d: %v",
						s.TournamentID, eliminator, seat.UserID, amt, cerr)
				} else if aerr := audit.EmitLedger(ctx, audit.NewPostgresEmitter(db), "tournament_bounty_paid", "", map[string]any{
					"tournament_id": s.TournamentID,
					"eliminator":    eliminator,
					"busted":        seat.UserID,
					"amount_cents":  amt,
				}); aerr != nil {
					logger.Warn("bounty audit anchor failed: %v", aerr)
				}
			}
		}
	}
}

// equippedAvatarID reads the player's currently-equipped avatar from their
// account metadata (the same key profile_meta_set writes). Returns "" for bots,
// isGuest reports whether a user is an unregistered guest (device-only auth): no
// email identity AND not a Clerk-linked account. Best-effort — on any error we
// treat the user as non-guest so a guest session is never over-recorded. Mirrors
// the account-type checks in rpc/recovery.go and rpc/security.go.
func isGuest(ctx context.Context, nk runtime.NakamaModule, userID string) bool {
	if userID == "" {
		return false
	}
	acct, err := nk.AccountGetId(ctx, userID)
	if err != nil {
		return false
	}
	return strings.TrimSpace(acct.GetEmail()) == "" && !strings.HasPrefix(acct.GetCustomId(), "clerk:")
}

// equippedAvatarID reads the player's currently-equipped avatar from
// poker_equipped (CosmeticStore.Equipped) — the same ownership-checked table
// CosmeticEquip writes and AvatarPanel reads (equipped["avatar"], falling
// back to equipped["portrait"]) — never from account metadata's "avatar" key.
// That key is a different, legacy field: profile_meta_set's whitelist lets a
// caller set it to ANY string with no ownership check at all, and the real
// equip flow (studio.equip -> cosmetic_equip) never writes it, so reading it
// here both attributed battle stats to an item nobody verified the player
// owns AND was disconnected from what a player actually equips through the
// real UI (poker_equipped) — stats were being attributed nowhere real.
// Returns "" for guests without a pick, or on any error — attribution is
// best-effort and must never break a hand.
func equippedAvatarID(ctx context.Context, db *sql.DB, userID string) string {
	if userID == "" {
		return ""
	}
	equipped, err := store.NewCosmeticStore(db).Equipped(ctx, userID)
	if err != nil {
		return ""
	}
	if av := equipped["avatar"]; av != "" {
		return av
	}
	return equipped["portrait"]
}

// achievements. HRP is earned by PLAYING, so losers still progress. Called before
// ResetBetweenHands, while seats still carry the hand's state.
func accrueLoyalty(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *MatchState, res poker.ShowdownResult) {
	winners := map[int]string{} // seat -> winning hand category
	for _, r := range res.Resolutions {
		for _, seat := range r.Winners {
			winners[seat] = r.HandCats[seat]
		}
	}
	ls := store.NewLoyaltyStore(db)
	ss := store.NewStatsStore(db)
	for _, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot || seat.UserID == "" {
			continue
		}
		if _, present := s.Presences[seat.UserID]; !present {
			continue
		}
		cat, won := winners[seat.Index]
		base := int64(1)
		if won {
			base += 2
		}
		tier := store.SubscriptionTier(ctx, db, seat.UserID)
		hrp := int64(float64(base) * loyalty.Multiplier(tier))
		if hrp < 1 {
			hrp = 1
		}
		wonDelta := int64(0)
		if won {
			wonDelta = 1
		}
		l, err := ls.Award(ctx, seat.UserID, hrp, 1, wonDelta)
		if err != nil {
			continue
		}
		// Attribute this hand to the character the player has equipped, so every
		// avatar accrues its own battle record (rounds played + win rate).
		if av := equippedAvatarID(ctx, db, seat.UserID); av != "" {
			_ = store.NewAvatarStatsStore(db).Increment(ctx, seat.UserID, av, won)
		}
		// Ledger the HRP event (loyalty_history) and feed the native HRP + hands
		// leaderboards (best-effort — never break the hand).
		_ = ss.RecordHRP(ctx, seat.UserID, hrp, "hand_played", nil)
		social.RecordHRP(ctx, nk, seat.UserID, seat.Username, hrp)
		social.RecordHands(ctx, nk, seat.UserID, seat.Username, 1)
		for _, code := range loyalty.AchievementsForResult(l.HandsPlayed, l.HandsWon, won, cat) {
			if newly, _ := ls.UnlockAchievement(ctx, seat.UserID, code); newly {
				if a, ok := loyalty.Catalog[code]; ok && a.HRP > 0 {
					_, _ = ls.Award(ctx, seat.UserID, a.HRP, 0, 0)
					_ = ss.RecordHRP(ctx, seat.UserID, a.HRP, "achievement:"+code, nil)
					social.RecordHRP(ctx, nk, seat.UserID, seat.Username, a.HRP)
				}
			}
		}
	}
}

// processPendingSeatIn seats every player queued by MatchSignal case
// "tournament_seat_in" (see PendingSeatIn), called only from MatchLoop's
// between-hands safe point so a transferred-in player can never appear mid
// hand and corrupt dealer-button/action-seat indices. Uses
// Table.SeatTransferIn — no buy-in clamp, since these are tournament chips
// already in play, not a fresh wallet buy-in: clamping here would mint chips
// for a short stack or destroy them for a big one.
func processPendingSeatIn(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	moved := false
	for userID, req := range s.PendingSeatIn {
		delete(s.PendingSeatIn, userID)
		if seatForUser(s, userID) >= 0 {
			continue // already seated (shouldn't happen, but never double-seat)
		}
		seatIdx := s.Table.FirstEmptySeat()
		if seatIdx < 0 {
			// The reservation check in "tournament_seat_in" should have refused
			// this before it was ever queued; re-queue rather than drop the
			// player's chips into nowhere, and let the next safe point retry.
			logger.Error("tournament seat-in: table full at safe point, re-queuing user=%s", userID)
			s.PendingSeatIn[userID] = req
			continue
		}
		if err := s.Table.SeatTransferIn(seatIdx, userID, req.Username, req.Stack); err != nil {
			logger.Error("tournament seat-in failed user=%s: %v", userID, err)
			continue
		}
		moved = true
	}
	if moved {
		dispatcher.MatchLabelUpdate(buildLabel(s))
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	}
}

// applyKick performs the actual removal for a "kick" host action: return the
// buy-in, clear per-seat bookkeeping, close the session, and stand the seat
// up. Shared by the immediate path (host_action "kick" when the seat is
// already safe to touch) and processPendingKicks (the deferred path for a
// seat that was still live in a hand when the kick was issued).
func applyKick(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, seatIdx int) {
	seat := s.Table.Seats[seatIdx]
	if seat == nil {
		return
	}
	releaseBuyIn(ctx, logger, db, s, seatIdx, seat.UserID, seat.Stack)
	delete(s.SeatWallet, seatIdx)
	delete(s.SeatLocked, seatIdx)
	_ = store.NewActiveSeatStore(db).Unregister(ctx, seat.UserID, matchIDForAudit(s))
	name := seat.Username
	closeSeatSession(ctx, db, s, seatIdx)
	s.Table.StandUp(seatIdx)
	narrate(dispatcher, s, fmt.Sprintf("Host removed %s from the table.", name))
}

// processPendingKicks drains PendingKickSeats, called only from MatchLoop's
// PhaseWaiting safe point (see the "kick" host_action case: a kick issued
// while the seat was SeatSeated/SeatAllIn mid-hand is queued here rather than
// applied immediately, and — before this existed — rather than ever). A
// queued seat may have already emptied on its own (voluntary stand-up,
// disconnect) by the time this runs; skip it silently rather than double
// -removing.
func processPendingKicks(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	kicked := false
	for seatIdx := range s.PendingKickSeats {
		delete(s.PendingKickSeats, seatIdx)
		if seatIdx < 0 || seatIdx >= poker.MaxSeats || s.Table.Seats[seatIdx] == nil {
			continue
		}
		applyKick(ctx, logger, db, dispatcher, s, seatIdx)
		kicked = true
	}
	if kicked {
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	}
}

// processPendingSeatTransfers executes every seat transfer the tournament
// director has queued for this table (see MatchSignal case
// "tournament_seat_out"), called only from MatchLoop's between-hands safe
// point. For each queued player it signals the destination match to accept
// them with their exact live stack ("tournament_seat_in") and stands them up
// here ONLY once the destination durably commits to seating them (its own
// PendingSeatIn queue, processed at ITS next safe point — not proof they're
// already seated there) — a "full"/"error"/transport failure instead leaves
// the player seated right where they are, rather than vanishing them from the
// tournament. The DB match_id (poker_tournament_registration) is updated
// here, at the point the move is actually committed to — not by the director
// when it merely decided the move should happen, which is what let that
// bookkeeping drift from reality before.
func processPendingSeatTransfers(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, s *MatchState) {
	moved := false
	for userID, dest := range s.PendingSeatOut {
		delete(s.PendingSeatOut, userID)
		seatIdx := seatForUser(s, userID)
		if seatIdx < 0 {
			continue // busted / already gone / never was here
		}
		seat := s.Table.Seats[seatIdx]
		if seat.Stack <= 0 {
			continue // busted seats are handled by reportTournamentBusts/MarkBusted
		}
		payload, _ := json.Marshal(map[string]interface{}{
			"type":     "tournament_seat_in",
			"user_id":  userID,
			"username": seat.Username,
			"stack":    seat.Stack,
		})
		resp, err := nk.MatchSignal(ctx, dest, string(payload))
		if err != nil || resp != "ok" {
			logger.Error("tournament seat transfer refused user=%s dest=%s resp=%q: %v", userID, dest, resp, err)
			continue // leave them seated here rather than strand them nowhere
		}
		if p, ok := s.Presences[userID]; ok {
			movedMsg, _ := json.Marshal(map[string]interface{}{"new_match_id": dest})
			_ = dispatcher.BroadcastMessage(protocol.OpTableMoved, movedMsg, []runtime.Presence{p}, nil, true)
		}
		s.Table.StandUp(seatIdx)
		if err := store.NewTournamentStore(db).AssignPlayerTable(ctx, s.TournamentID, userID, dest); err != nil {
			logger.Error("tournament seat transfer: match_id not recorded user=%s dest=%s: %v", userID, dest, err)
		}
		moved = true
	}
	if moved {
		dispatcher.MatchLabelUpdate(buildLabel(s))
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	}
}

// standUpBusted removes any seat with no chips left after a hand settles. On a
// cash table a felted player (bot or human) must leave the seat — leaving them
// seated at $0 wastes a seat and, before the allMatched() fix, could deadlock the
// betting round. Tournaments keep busted seats for elimination reporting.
// standUpBusted clears felted (stack ≤ 0) players between hands so a cash table
// stays playable. When the table has auto buy-back enabled (#86), a busted human
// is instead auto-topped-up from their wallet to the configured stack and kept
// seated — the proven "auto-rebuy" mechanic — falling back to standing up only
// when their wallet can't fund the rebuy.
func standUpBusted(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if s.TournamentID != "" {
		return
	}
	// Inactivity auto-kick (#86): stand up any seated human who has hit the
	// consecutive-timeout threshold, now that the hand is over (safe point).
	for i, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot || s.TimeoutStreak[seat.UserID] < maxConsecutiveTimeouts {
			continue
		}
		name := seat.Username
		releaseBuyIn(ctx, logger, db, s, i, seat.UserID, seat.Stack)
		delete(s.SeatWallet, i)
		delete(s.SeatLocked, i)
		delete(s.TimeoutStreak, seat.UserID)
		_ = store.NewActiveSeatStore(db).Unregister(ctx, seat.UserID, matchIDForAudit(s))
		closeSeatSession(ctx, db, s, i)
		s.Table.StandUp(i)
		narrate(dispatcher, s, fmt.Sprintf("%s was removed for inactivity (%d consecutive time-outs).", name, maxConsecutiveTimeouts))
	}
	for i, seat := range s.Table.Seats {
		if seat == nil || seat.Stack > 0 {
			continue
		}
		if s.AutoBuyBackCents > 0 && !seat.IsBot {
			topUp := poker.ClampBuyInBand(s.AutoBuyBackCents, s.NoMaxBuyIn)
			// Respect the table band + any universal wallet cap on the seat.
			if topUp < s.minBuyIn() {
				topUp = s.minBuyIn()
			}
			if !s.NoMaxBuyIn && topUp > s.maxBuyIn() {
				topUp = s.maxBuyIn()
			}
			if s.WalletLimitCents > 0 && topUp > s.WalletLimitCents {
				topUp = s.WalletLimitCents
			}
			if topUp > 0 {
				// s.minBuyIn() is an operator-configured value that can legally sit
				// below poker.MinBuyInCents; when it does, reserveBuyIn's own
				// ClampBuyInBand floor reserves MORE than topUp. Crediting the
				// stack with the pre-clamp `topUp` instead of what was actually
				// reserved (`reserved`) would destroy that difference — debited
				// from the wallet/club lock, never appearing on the stack, never
				// returned to anyone.
				if w, reserved := reserveBuyIn(ctx, db, s, seat.UserID, topUp, s.SeatWallet[i], s.SeatWallet[i] == "club"); w != "" {
					seat.Stack += reserved
					s.SeatWallet[i] = w
					s.SeatBuyIn[i] += reserved // count the auto-rebuy toward this sitting's buy-in (Tier-1 C)
					narrate(dispatcher, s, fmt.Sprintf("%s auto-bought back in for $%d.", seat.Username, reserved/100))
					continue
				}
			}
		}
		closeSeatSession(ctx, db, s, i)
		s.Table.StandUp(i)
	}
}

// evictExcluded stands up any seated human who has self-excluded or entered a
// cool-off WHILE seated (#95). Responsible-gambling status is checked at the
// sit-down gate (OpSitDown), but a player who self-excludes mid-session would
// otherwise keep playing until they voluntarily stand up. Run only at the safe
// between-hands point (right after standUpBusted), so no cards or pot chips are
// live — the same reason the Tier-0 cashout-lock permits it. Reuses the proven
// eviction idiom: releaseBuyIn → delete SeatWallet → Unregister → StandUp.
func evictExcluded(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if s.TournamentID != "" {
		return // tournament seats can't cash out mid-event; RG is enforced at registration
	}
	rg := store.NewResponsibleStore(db)
	for i, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot {
			continue
		}
		blocked, kind, _, err := rg.IsRestricted(ctx, seat.UserID)
		if err != nil || !blocked {
			continue
		}
		name := seat.Username
		releaseBuyIn(ctx, logger, db, s, i, seat.UserID, seat.Stack)
		delete(s.SeatWallet, i)
		delete(s.SeatLocked, i)
		_ = store.NewActiveSeatStore(db).Unregister(ctx, seat.UserID, matchIDForAudit(s))
		closeSeatSession(ctx, db, s, i)
		s.Table.StandUp(i)
		narrate(dispatcher, s, fmt.Sprintf("%s was removed (%s) and their chips returned.", name, strings.ReplaceAll(kind, "_", "-")))
	}
}

// evictBannedOrKicked stands up any seated human whose access has been
// revoked since they sat down — the club-membership check at OpSitDown was
// previously a one-shot gate: a member banned or kicked WHILE seated kept
// playing indefinitely, since nothing re-checked their status until they
// voluntarily stood up. Two independent checks, run at the same safe
// between-hands point evictExcluded uses (never mid-hand):
//
//   - Platform ban (store.IsBanned) evicts from EVERY table, regardless of
//     access type — a platform-wide lock means no access to anything.
//   - Club membership status evicts only at THIS club's members-only tables
//     (AccessType=="members") — a public or invite-coded table was never
//     gated on club membership in the first place, so losing it changes
//     nothing there; only a members-only table's whole premise is broken by
//     an unnoticed loss of membership.
func evictBannedOrKicked(ctx context.Context, logger runtime.Logger, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if s.TournamentID != "" {
		return // tournament seats can't be pulled mid-event by a club-side action
	}
	membersOnly := s.AccessType == "members" && s.ClubID != ""
	for i, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot {
			continue
		}
		reason := ""
		if banned, _, err := store.IsBanned(ctx, db, seat.UserID); err == nil && banned {
			reason = "account suspended"
		} else if membersOnly {
			if m, _ := store.NewClubStore(db).GetMembership(ctx, s.ClubID, seat.UserID); m == nil || m.Status != "active" {
				reason = "no longer a club member"
			}
		}
		if reason == "" {
			continue
		}
		name := seat.Username
		releaseBuyIn(ctx, logger, db, s, i, seat.UserID, seat.Stack)
		delete(s.SeatWallet, i)
		delete(s.SeatLocked, i)
		_ = store.NewActiveSeatStore(db).Unregister(ctx, seat.UserID, matchIDForAudit(s))
		closeSeatSession(ctx, db, s, i)
		s.Table.StandUp(i)
		narrate(dispatcher, s, fmt.Sprintf("%s was removed (%s) and their chips returned.", name, reason))
	}
}

// closeSeatSession finalizes the open seat_session for a seat as the player leaves
// (Tier-1 C), computing net = stack − cumulative-buy-in and the hit-and-run flag.
// MUST be called BEFORE s.Table.StandUp clears the seat, so it can read the stack.
// A no-op when the seat has no open session (bots, or already closed) — safe to
// call at every exit path.
func closeSeatSession(ctx context.Context, db *sql.DB, s *MatchState, seatIdx int) {
	id := s.SeatSessionID[seatIdx]
	if id == "" {
		return
	}
	var stack int64
	if seat := s.Table.Seats[seatIdx]; seat != nil {
		stack = seat.Stack
	}
	buyIn := s.SeatBuyIn[seatIdx]
	hands := s.SeatHands[seatIdx]
	net := stack - buyIn
	hitAndRun := hands < hitAndRunMinHands && net > 0
	_, _ = store.NewSeatSessionStore(db).Close(ctx, id, buyIn, hands, stack, net, hitAndRun)
	delete(s.SeatSessionID, seatIdx)
	delete(s.SeatBuyIn, seatIdx)
	delete(s.SeatHands, seatIdx)
}

// moveSeatTracking relocates every per-seat, index-keyed tracking entry (wallet
// source, open seat-session, cumulative buy-in, hands played) from one seat index
// to another when a player changes seats, so cash-out and hit-and-run records stay
// attached to the mover.
func moveSeatTracking(s *MatchState, from, to int) {
	if v, ok := s.SeatWallet[from]; ok {
		s.SeatWallet[to] = v
		delete(s.SeatWallet, from)
	}
	if v, ok := s.SeatSessionID[from]; ok {
		s.SeatSessionID[to] = v
		delete(s.SeatSessionID, from)
	}
	if v, ok := s.SeatBuyIn[from]; ok {
		s.SeatBuyIn[to] = v
		delete(s.SeatBuyIn, from)
	}
	if v, ok := s.SeatHands[from]; ok {
		s.SeatHands[to] = v
		delete(s.SeatHands, from)
	}
}

func reportTournamentBusts(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *MatchState) {
	if s.TournamentID == "" {
		return
	}
	tStore := store.NewTournamentStore(db)
	for _, seat := range s.Table.Seats {
		if seat == nil {
			continue
		}
		if seat.Stack <= 0 {
			_ = tStore.MarkBusted(ctx, s.TournamentID, seat.UserID)
		} else {
			_ = tStore.UpdatePlayerStack(ctx, s.TournamentID, seat.UserID, seat.Stack)
		}
	}
}

func (h *Handler) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (h *Handler) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	s := state.(*MatchState)
	var sig map[string]interface{}
	if err := json.Unmarshal([]byte(data), &sig); err != nil {
		return s, ""
	}
	switch sig["type"] {
	case "is_host":
		// Authoritative host check for rpc.VideoTokenGet — the caller's isOwner
		// flag for a Daily.co meeting token must never come from a client
		// self-report (Daily grants recording permission off it), so the RPC
		// asks the match itself rather than trusting the request payload.
		userID, _ := sig["user_id"].(string)
		if userID != "" && userID == s.HostUserID {
			return s, "true"
		}
		return s, "false"
	case "can_admin":
		// Same authorization rpc.AIHostToggle needs, reusing the exact check
		// OpHostAction's dispatch gate already applies (host OR a club admin of
		// the sponsoring club) — a single source of truth for "who may administer
		// this table" rather than a second, possibly-drifted copy in rpc/.
		userID, _ := sig["user_id"].(string)
		if userID != "" && (userID == s.HostUserID || isClubAdminForTable(ctx, db, s, userID)) {
			return s, "true"
		}
		return s, "false"
	case "ai_host_get":
		out, _ := json.Marshal(map[string]interface{}{"session_id": s.AIHostSessionID, "enabled": s.AIHostEnabled})
		return s, string(out)
	case "ai_host_set":
		// Only ever called by rpc.AIHostToggle after it has already verified the
		// caller via "can_admin" above and (when enabling) already started the
		// real Pipecat Cloud session — this just records the outcome on match
		// state. Blocking Daily/Pipecat HTTP calls stay in rpc/ai_host.go, never
		// here, matching how VideoTokenGet already keeps external calls out of
		// the match loop.
		enabled, _ := sig["enabled"].(bool)
		s.AIHostEnabled = enabled
		if enabled {
			sessionID, _ := sig["session_id"].(string)
			secret, _ := sig["webhook_secret"].(string)
			s.AIHostSessionID = sessionID
			s.AIHostWebhookSecret = secret
			narrate(dispatcher, s, "An AI table host has joined — say hello, or just enjoy the commentary.")
		} else {
			s.AIHostSessionID = ""
			s.AIHostWebhookSecret = ""
			s.AINarrationLog = nil
			narrate(dispatcher, s, "The AI table host has been turned off.")
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return s, "ok"
	case "ai_host_poll":
		// Called (indirectly, via rpc.AIHostNarrationPoll) by the bot process
		// itself, not a player — authenticated by the per-table secret minted in
		// rpc.AIHostToggle rather than a Nakama session.
		secret, _ := sig["secret"].(string)
		if s.AIHostWebhookSecret == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(s.AIHostWebhookSecret)) != 1 {
			return s, `{"error":"unauthorized"}`
		}
		sinceF, _ := sig["since_seq"].(float64)
		since := int64(sinceF)
		entries := make([]aiNarrationEntry, 0, len(s.AINarrationLog))
		for _, e := range s.AINarrationLog {
			if e.Seq > since {
				entries = append(entries, e)
			}
		}
		out, _ := json.Marshal(map[string]interface{}{"entries": entries, "latest_seq": s.AINarrationSeq})
		return s, string(out)
	case "ai_host_reply":
		// The bot's own spoken/typed line, posted back into the same chat
		// channel narrate()'s dealer lines use — see rpc.AIHostChatPost.
		secret, _ := sig["secret"].(string)
		if s.AIHostWebhookSecret == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(s.AIHostWebhookSecret)) != 1 {
			return s, `{"error":"unauthorized"}`
		}
		text, _ := sig["text"].(string)
		text = sanitizeChat(text)
		if text == "" {
			return s, `{"error":"empty"}`
		}
		broadcastChat(dispatcher, s, protocol.ChatMessage{Username: "AI Host", Text: text, Kind: "ai_host", HandNo: s.Table.HandNo})
		return s, `{"ok":true}`
	case "pause":
		// Platform-admin freeze (tables_freeze_all) — no host socket required.
		s.AdminPaused = true
		s.NextDealTick = 0
		narrate(dispatcher, s, "An administrator paused this table.")
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "resume":
		s.AdminPaused = false
		narrate(dispatcher, s, "An administrator resumed this table.")
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "tournament_break_start":
		// Sent by the tournament director when its blind schedule enters an
		// IsBreak level. Distinct from "pause"/AdminPaused on purpose: a break
		// ends on its own timer, not an operator's resume click, so conflating
		// the two flags would mean an admin's platform-wide freeze/resume and a
		// tournament's own break clock could clear each other's state.
		s.TournamentBreak = true
		s.NextDealTick = 0
		narrate(dispatcher, s, "Tournament break — dealing will resume when it ends.")
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "tournament_break_end":
		s.TournamentBreak = false
		narrate(dispatcher, s, "Break's over — dealing back in.")
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "tournament_seat_out":
		// Sent by the tournament director (match/tournament/director.go
		// mergeTable) when a multi-table rebalance breaks this table and moves
		// one of its players elsewhere. Queued rather than executed immediately:
		// MatchSignal runs outside MatchLoop's message queue, so it has none of
		// the "only between hands" protection the cashout-lock invariant relies
		// on elsewhere — acting on it here could rip a seat out of a live pot.
		// MatchLoop's PhaseWaiting safe point (processPendingSeatTransfers)
		// performs the actual move.
		userID, _ := sig["user_id"].(string)
		dest, _ := sig["dest_match_id"].(string)
		if userID == "" || dest == "" || dest == matchIDForAudit(s) {
			break
		}
		if s.PendingSeatOut == nil {
			s.PendingSeatOut = map[string]string{}
		}
		s.PendingSeatOut[userID] = dest
	case "tournament_seat_in":
		// Sent by another table's processPendingSeatTransfers, offering an
		// incoming tournament player with their EXACT existing stack. This
		// only QUEUES the seat (PendingSeatIn) rather than seating them right
		// here — MatchSignal runs outside MatchLoop's message queue, so acting
		// immediately could insert a seat into a hand that's mid-betting on
		// THIS table right now, corrupting its dealer-button/action-seat
		// indices. processPendingSeatIn performs the actual seat at MatchLoop's
		// next between-hands safe point. The response string still means what
		// the sender needs it to: "ok" is a durable commitment to seat this
		// player soon, which is what lets the sender stand them up at their old
		// table now — not proof they're already seated here.
		userID, _ := sig["user_id"].(string)
		username, _ := sig["username"].(string)
		stackF, _ := sig["stack"].(float64)
		stack := int64(stackF)
		if userID == "" || stack <= 0 {
			return s, "invalid"
		}
		if seatForUser(s, userID) >= 0 {
			return s, "ok" // already seated here — idempotent retry
		}
		if _, queued := s.PendingSeatIn[userID]; queued {
			return s, "ok" // already queued — idempotent retry
		}
		// Reserve against seats already spoken for by earlier-queued transfers,
		// not just currently-occupied ones, so a burst of concurrent transfers
		// can't all be accepted and then overflow the table at the safe point.
		reserved := len(s.PendingSeatIn)
		if s.Table.SeatedCount()+reserved >= s.Table.Cap() {
			return s, "full"
		}
		if s.PendingSeatIn == nil {
			s.PendingSeatIn = map[string]pendingTournamentSeat{}
		}
		s.PendingSeatIn[userID] = pendingTournamentSeat{Username: username, Stack: stack}
		return s, "ok"
	case "blind_update":
		if v, ok := sig["small_blind"].(float64); ok {
			s.SmallBlind = int64(v)
		}
		if v, ok := sig["big_blind"].(float64); ok {
			s.BigBlind = int64(v)
		}
		if v, ok := sig["ante"].(float64); ok {
			s.Ante = int64(v)
		}
		payload, _ := json.Marshal(map[string]interface{}{
			"small_blind": s.SmallBlind,
			"big_blind":   s.BigBlind,
			"ante":        s.Ante,
			"level":       sig["level"],
		})
		_ = dispatcher.BroadcastMessage(protocol.OpBlindUpdate, payload, nil, nil, true)
	case "balance_table":
		// The same money-destruction bug the "kick" host action had: a felted
		// (Stack<=0) seat that is currently SeatAllIn in a LIVE hand still has
		// its real stake sitting in TotalContributed, not at the seat — a
		// zero-stack seat is exactly what an all-in player looks like while
		// their hand is still being contested. Standing them up here removes
		// their seat from t.Seats before the pot resolves, and BuildSidePots
		// only sums TotalContributed for seats that still exist: their stake
		// is silently dropped from every side-pot layer — never paid to them,
		// never reaching anyone else, never reaching the house. MatchSignal
		// runs outside the MatchLoop message queue, so it is not protected by
		// that loop's "hand_busy" phase gate — this check is the only thing
		// standing between an automated multi-table rebalance and that loss.
		for i, seat := range s.Table.Seats {
			if seat == nil || seat.Stack > 0 {
				continue
			}
			if s.Phase != poker.PhaseWaiting && seat.Status == poker.SeatAllIn {
				continue // still contesting a live pot — leave them seated
			}
			closeSeatSession(ctx, db, s, i)
			s.Table.StandUp(i)
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "close":
		// Admin-initiated teardown (admin_table_close RPC). Flag the table so the
		// loop closes it between hands — refunding seated stacks without abandoning
		// a live pot. If already idle, close immediately.
		s.HostClosed = true
		narrate(dispatcher, s, "An administrator is closing this table…")
		if s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
			closeTable(ctx, logger, db, dispatcher, s, "closed by an administrator")
			return nil, ""
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "add_bot":
		// Same host check OpHostAction's dispatch already applies to every
		// other host command (kick/pause/close/set_blinds/...) — table_add_bot
		// had no caller verification anywhere before this, on either the RPC
		// side or here, so any authenticated player could add bots to a table
		// they weren't hosting or even seated at.
		callerID, _ := sig["user_id"].(string)
		if s.HostUserID == "" || callerID != s.HostUserID {
			break
		}
		if realMoneyEnabled() {
			break // no bots on real-money tables
		}
		seatIdx := s.Table.FirstEmptySeat()
		if seatIdx >= 0 {
			s.BotCount++
			// Same band the human path uses (reserveBuyIn / OpSitDown): the
			// table's own configured stakes, not always the $1,000 global
			// default — a bot's buy-in must not silently disagree with what
			// human players at the same table are actually seated for.
			buyIn := poker.ClampBuyInBand(s.BuyIn, s.NoMaxBuyIn)
			name := fmt.Sprintf("Bot_%d", s.BotCount)
			botID := fmt.Sprintf("bot_%s_%d", s.RoomID, seatIdx)
			var err error
			if s.NoMaxBuyIn {
				err = s.Table.SitDownBotUnlimited(seatIdx, botID, name, buyIn)
			} else {
				err = s.Table.SitDownBot(seatIdx, botID, name, buyIn)
			}
			if err == nil {
				dispatcher.MatchLabelUpdate(buildLabel(s))
				broadcastSnapshot(ctx, db, dispatcher, s, nil)
			}
		}
	}
	return s, ""
}

func seatForUser(s *MatchState, userID string) int {
	for i, seat := range s.Table.Seats {
		if seat != nil && seat.UserID == userID {
			return i
		}
	}
	return -1
}

func buildLabel(s *MatchState) string {
	seated := s.Table.SeatedCount()
	label, _ := json.Marshal(map[string]interface{}{
		"module":     protocol.MatchModule,
		"room_id":    s.RoomID,
		"seated":     seated,
		"open_seats": s.Table.Cap() - seated,
		"sb":         s.SmallBlind,
		"bb":         s.BigBlind,
		"status":     poker.HandPhaseForTable(s.Table, s.Phase),
		// Access policy (#83) so the lobby can badge/filter tables. "invite" tables
		// omit the code itself — the label is world-readable.
		"access_type":      s.AccessType,
		"invite_only":      s.AccessType == "invite" || s.AccessType == "members",
		"allow_spectators": s.AllowSpectators,
		"club_id":          s.ClubID,
		"stake_mode":       s.StakeMode,
		// Operating window (dpts_8) so a browser can say "opens 18:00 UTC" instead
		// of offering a seat the sit-down gate is about to refuse. Omitted entirely
		// when the table is always open, which is the common case.
		"operating_start_min": s.OperatingStartMin,
		"operating_end_min":   s.OperatingEndMin,
		"open_now":            store.WithinDailyWindow(s.OperatingStartMin, s.OperatingEndMin, time.Now()),
	})
	return string(label)
}

// equippedModelURL returns the GLB asset URL of a player's equipped 3D character
// (empty if none / a bot). Lets generated Tripo characters render at the seat.
func equippedModelURL(ctx context.Context, db *sql.DB, userID string, isBot bool) string {
	if userID == "" || isBot {
		return ""
	}
	cs := store.NewCosmeticStore(db)
	equipped, err := cs.Equipped(ctx, userID)
	if err != nil {
		return ""
	}
	cid, ok := equipped["model"]
	if !ok || cid == "" {
		return ""
	}
	c, err := cs.GetByID(ctx, cid)
	if err != nil || c == nil {
		return ""
	}
	return c.AssetRef
}

// isClubAdminForTable reports whether userID administers the club sponsoring
// this table (owner, or an operator with can_configure) — the same
// ClubsAdministeredBy lookup the me_roles RPC and the host-under-a-club table
// creation flow already use, so a delegate's authority here matches exactly
// what the Owner Hub already considers "a club admin", not a separate concept.
func isClubAdminForTable(ctx context.Context, db *sql.DB, s *MatchState, userID string) bool {
	if s.ClubID == "" {
		return false
	}
	clubs, err := store.NewClubStore(db).ClubsAdministeredBy(ctx, userID)
	if err != nil {
		return false
	}
	for _, id := range clubs {
		if id == s.ClubID {
			return true
		}
	}
	return false
}

func snapshotFor(ctx context.Context, db *sql.DB, s *MatchState, heroID string) protocol.TableSnapshot {
	cap := s.Table.Cap()
	seats := make([]protocol.SeatView, cap)
	for i := 0; i < cap; i++ {
		seats[i] = protocol.SeatView{Index: i, Status: "empty"}
		if s.Table.Seats[i] != nil {
			seat := s.Table.Seats[i]
			seats[i] = protocol.SeatView{
				Index:      i,
				UserID:     seat.UserID,
				Username:   seat.Username,
				Stack:      seat.Stack,
				Status:     string(seat.Status),
				LastAction: seat.LastAction,
				IsHero:     seat.UserID == heroID,
				IsBot:      seat.IsBot,
				ModelURL:   equippedModelURL(ctx, db, seat.UserID, seat.IsBot),
				Bet:        seat.Bet,
				SittingOut: seat.SittingOut,
				OwesPost:   seat.OwesPost,
			}
		}
	}
	board := make([]protocol.CardView, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		board = append(board, protocol.CardView{Code: c.Code(), FaceUp: true})
	}
	heroWallet, _ := store.NewWalletStore(db).Get(ctx, heroID)
	// Buy-in options for the client dialog: the table band, whether the club
	// accepts the global wallet, and the hero's available club balance.
	var heroClubBalance int64
	acceptsGlobal := true // non-club tables always use the global wallet
	if s.ClubID != "" {
		acceptsGlobal = clubAcceptsGlobal(ctx, db, s.ClubID)
		if bal, err := store.NewClubStore(db).GetBalance(ctx, s.ClubID, heroID); err == nil && bal != nil {
			heroClubBalance = bal.Balance - bal.LockedAmount
		}
	}
	return protocol.TableSnapshot{
		MatchID:             s.MatchID,
		RoomID:              s.RoomID,
		MinBuyIn:            s.minBuyIn(),
		MaxBuyIn:            s.maxBuyIn(),
		AcceptsGlobalWallet: acceptsGlobal,
		HeroClubBalance:     heroClubBalance,
		Phase:               poker.HandPhaseForTable(s.Table, s.Phase),
		Seats:               seats,
		Board:               board,
		Pot:                 s.Table.Pot,
		CurrentBet:          s.Table.CurrentBet,
		ActionSeat:          s.Table.ActionSeat,
		ButtonSeat:          s.Table.ButtonSeat,
		SmallBlind:          s.effSmallBlind(),
		BigBlind:            s.effBigBlind(),
		MaxSeats:            s.Table.Cap(),
		HeroWallet:          heroWallet,
		HandNo:              s.Table.HandNo,
		DeckCommitHash:      s.Table.DeckCommitment,
		Variant:             s.Table.Variant,
		RenderStyle:         s.RenderStyle,
		TableArt:            s.TableArt,
		HostUserID:          s.HostUserID,
		HostPaused:          s.effPaused() || s.AdminPaused,
		AIHostEnabled:       s.AIHostEnabled,
		AllowStraddle:       s.Table.AllowStraddle,
		AllowBombPot:        s.Table.AllowBombPot,
		AllowInsurance:      s.Table.AllowInsurance,
		AllowRunItTwice:     s.Table.AllowRunItTwice,
		StraddleArmed:       s.Table.StraddleRequested,
	}
}

func broadcastSnapshot(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, sender runtime.Presence) {
	for userID, p := range s.Presences {
		// Spectators-disabled tables (#83): only seated players (and the host) see
		// table state, so a non-seated rail cannot watch the action.
		if !s.AllowSpectators && userID != s.HostUserID && seatForUser(s, userID) < 0 {
			continue
		}
		snap := snapshotFor(ctx, db, s, userID)
		data, _ := json.Marshal(snap)
		_ = dispatcher.BroadcastMessage(protocol.OpSnapshot, data, []runtime.Presence{p}, sender, true)
	}
}

func broadcastHandStart(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	payload, _ := json.Marshal(snapshotFor(ctx, db, s, ""))
	_ = dispatcher.BroadcastMessage(protocol.OpHandStart, payload, nil, nil, true)
}

func dealPrivateCards(dispatcher runtime.MatchDispatcher, s *MatchState) {
	for userID, cards := range s.Table.HoleCards {
		p, ok := s.Presences[userID]
		if !ok {
			continue
		}
		seat := seatForUser(s, userID)
		cardViews := make([]protocol.CardView, len(cards))
		for i, c := range cards {
			cardViews[i] = protocol.CardView{Code: c.Code(), FaceUp: true}
		}
		msg := protocol.DealPrivateMessage{Seat: seat}
		// Encrypt the cards to the player's session key so the wire carries no
		// plaintext card codes. Falls back to plaintext only if no key exists.
		inner, _ := json.Marshal(map[string]interface{}{"cards": cardViews})
		if enc := encryptForUser(s, userID, inner); enc != "" {
			msg.Enc = enc
		} else {
			msg.Cards = cardViews
		}
		data, _ := json.Marshal(msg)
		_ = dispatcher.BroadcastMessage(protocol.OpDealPrivate, data, []runtime.Presence{p}, nil, true)
	}
}

func broadcastBoard(dispatcher runtime.MatchDispatcher, s *MatchState) {
	board := make([]protocol.CardView, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		board = append(board, protocol.CardView{Code: c.Code(), FaceUp: true})
	}
	data, _ := json.Marshal(map[string]interface{}{"board": board, "phase": s.Table.Street})
	_ = dispatcher.BroadcastMessage(protocol.OpBoard, data, nil, nil, true)
}

func broadcastActionRequired(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	seat := s.Table.ActionSeat
	if seat < 0 {
		return
	}
	seatData := s.Table.Seats[seat]
	if seatData == nil {
		return
	}
	actions, toCall, minRaise, maxRaise := s.Table.ValidActions(seat)
	msg := protocol.ActionRequiredMessage{
		Seat:         seat,
		ValidActions: actions,
		ToCall:       toCall,
		MinRaise:     minRaise,
		MaxRaise:     maxRaise,
		Pot:          s.Table.Pot,
		ActionSecs:   s.actionSecsEff(),
		TimeBankSecs: int(s.TimeBank[seatData.UserID]),
	}
	data, _ := json.Marshal(msg)
	p, ok := s.Presences[seatData.UserID]
	if ok {
		_ = dispatcher.BroadcastMessage(protocol.OpActionRequired, data, []runtime.Presence{p}, nil, true)
	}
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

func broadcastShowdownFromResult(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, winnerGroups [][]int, res poker.ShowdownResult, pot int64) error {
	// Show-order + muck (integrity): at a REAL showdown, winners must show to
	// claim, and the first-to-show (last aggressor on the final street, or the
	// first active seat left of the button if checked down) must also show.
	// Everyone else MAY MUCK — their hole cards are NOT revealed. Previously every
	// player's hand leaked to all clients; now losers keep theirs hidden. An
	// uncontested pot (all others folded) is taken down with no show at all.
	shown := map[string]bool{}
	contenders := 0
	for _, seat := range s.Table.Seats {
		if seat != nil && seat.UserID != "" && seat.Status != poker.SeatFolded && seat.Status != poker.SeatEmpty {
			contenders++
		}
	}
	if contenders >= 2 {
		markShown := func(seatIdx int) {
			if seatIdx >= 0 && seatIdx < len(s.Table.Seats) {
				if seat := s.Table.Seats[seatIdx]; seat != nil && seat.UserID != "" {
					shown[seat.UserID] = true
				}
			}
		}
		markShown(s.Table.FirstToShowSeat())
		for _, group := range winnerGroups {
			for _, seatIdx := range group {
				markShown(seatIdx)
			}
		}
	}
	reveal := map[string][]protocol.CardView{}
	for userID, cards := range s.Table.HoleCards {
		if !shown[userID] {
			continue // mucked — not revealed to the table
		}
		views := make([]protocol.CardView, len(cards))
		for i, c := range cards {
			views[i] = protocol.CardView{Code: c.Code(), FaceUp: true}
		}
		reveal[userID] = views
	}
	winnerViews := make([]map[string]interface{}, 0)
	for potIdx, group := range winnerGroups {
		var handCat string
		if potIdx < len(res.Resolutions) {
			for _, seat := range group {
				if cat, ok := res.Resolutions[potIdx].HandCats[seat]; ok {
					handCat = cat
					break
				}
			}
		}
		for _, seat := range group {
			if s.Table.Seats[seat] == nil {
				continue
			}
			// Only rank a made hand when a full 5-card board exists. An uncontested
			// pot (everyone folded) is won without a showdown and has an incomplete
			// board — ranking it would call rs_poker with <5 cards and error.
			if handCat == "" && len(s.Table.Board) >= 5 {
				if cat, err := poker.HandCategory(seat, s.Table); err == nil {
					handCat = cat
				}
			}
			if handCat == "" {
				handCat = "uncontested"
			}
			winnerViews = append(winnerViews, map[string]interface{}{
				"seat":     seat,
				"pot":      potIdx,
				"user_id":  s.Table.Seats[seat].UserID,
				"username": s.Table.Seats[seat].Username,
				"hand":     handCat,
				"engine":   "rs_poker",
			})
		}
	}
	payload := map[string]interface{}{
		"pot":         pot,
		"hands":       reveal,
		"winners":     winnerViews,
		"side_pots":   len(winnerGroups),
		"deck_commit": s.Table.DeckCommitment, // committed before the deal
		"reveal_seed": s.Table.DeckSeed,       // reveal now — re-run to verify fairness
	}
	// Run-it-twice: surface each dealt board so the client can show all runouts.
	if len(res.Boards) > 0 {
		boards := make([][]protocol.CardView, 0, len(res.Boards))
		for _, b := range res.Boards {
			cv := make([]protocol.CardView, 0, len(b))
			for _, c := range b {
				cv = append(cv, protocol.CardView{Code: c.Code(), FaceUp: true})
			}
			boards = append(boards, cv)
		}
		payload["boards"] = boards
		payload["run_it_twice"] = true
	}
	data, _ := json.Marshal(payload)
	_ = dispatcher.BroadcastMessage(protocol.OpShowdown, data, nil, nil, true)

	// Play-by-play: announce each pot's winner(s) and amount.
	for _, r := range res.Resolutions {
		if len(r.Winners) == 0 || r.Amount <= 0 {
			continue
		}
		share := r.Amount / int64(len(r.Winners))
		for _, seat := range r.Winners {
			if seat < 0 || seat >= len(s.Table.Seats) || s.Table.Seats[seat] == nil {
				continue
			}
			line := fmt.Sprintf("%s wins $%d", s.Table.Seats[seat].Username, share/100)
			if cat := r.HandCats[seat]; cat != "" {
				line += " with " + humanizeHand(cat)
			}
			narrate(dispatcher, s, line)
		}
	}

	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	return nil
}

// humanizeHand turns an rs_poker category ("OnePair") into prose ("a pair").
func humanizeHand(cat string) string {
	switch strings.ToLower(strings.ReplaceAll(cat, " ", "")) {
	case "highcard":
		return "high card"
	case "onepair", "pair":
		return "a pair"
	case "twopair":
		return "two pair"
	case "threeofakind", "trips", "set":
		return "three of a kind"
	case "straight":
		return "a straight"
	case "flush":
		return "a flush"
	case "fullhouse":
		return "a full house"
	case "fourofakind", "quads":
		return "four of a kind"
	case "straightflush":
		return "a straight flush"
	case "royalflush":
		return "a royal flush"
	default:
		return cat
	}
}

func sanitizeChat(s string) string {
	s = strings.TrimSpace(s)
	// Drop control characters (incl. newlines) and cap length.
	s = strings.Map(func(r rune) rune {
		if r < 0x20 {
			return -1
		}
		return r
	}, s)
	if len(s) > 240 {
		s = s[:240]
	}
	return s
}

func broadcastChat(dispatcher runtime.MatchDispatcher, s *MatchState, msg protocol.ChatMessage) {
	data, _ := json.Marshal(msg)
	_ = dispatcher.BroadcastMessage(protocol.OpChat, data, nil, nil, true)
}

// aiNarrationEntry is one line of the AI host's narration feed — see
// AINarrationLog on MatchState. Seq is monotonic per match so the bot's poll
// can ask "anything after N".
type aiNarrationEntry struct {
	Seq  int64  `json:"seq"`
	Text string `json:"text"`
}

// aiNarrationLogCap bounds AINarrationLog — the bot polls every ~1-2s, so a
// couple minutes of history is more than enough context and keeps this off
// the per-match memory footprint otherwise.
const aiNarrationLogCap = 40

// narrate emits a dealer play-by-play line to everyone at the table. When the
// AI host is enabled, the exact same public text also lands in its narration
// feed — it never sees anything narrate() doesn't already broadcast to every
// player (no hole cards, no solver output; see rpc/ai_host.go).
func narrate(dispatcher runtime.MatchDispatcher, s *MatchState, text string) {
	broadcastChat(dispatcher, s, protocol.ChatMessage{
		Username: "Dealer",
		Text:     text,
		Kind:     "dealer",
		HandNo:   s.Table.HandNo,
	})
	if s.AIHostEnabled {
		s.AINarrationSeq++
		s.AINarrationLog = append(s.AINarrationLog, aiNarrationEntry{Seq: s.AINarrationSeq, Text: text})
		if len(s.AINarrationLog) > aiNarrationLogCap {
			s.AINarrationLog = s.AINarrationLog[len(s.AINarrationLog)-aiNarrationLogCap:]
		}
	}
}

// narrateAction describes a player's action for the play-by-play feed. Call it
// AFTER the action is applied (reads the seat's updated bet).
func narrateAction(dispatcher runtime.MatchDispatcher, s *MatchState, seat int, action string) {
	if seat < 0 || seat >= len(s.Table.Seats) || s.Table.Seats[seat] == nil {
		return
	}
	name := s.Table.Seats[seat].Username
	bet := s.Table.Seats[seat].Bet
	var text string
	switch action {
	case "fold":
		text = name + " folds"
	case "check":
		text = name + " checks"
	case "call":
		text = name + " calls"
	case "raise":
		text = fmt.Sprintf("%s raises to $%d", name, bet/100)
	case "all_in":
		text = fmt.Sprintf("%s is all-in ($%d)", name, bet/100)
	default:
		text = name + " " + action
	}
	narrate(dispatcher, s, text)
}

func sendError(dispatcher runtime.MatchDispatcher, p runtime.Presence, code, message string) {
	data, _ := json.Marshal(protocol.ErrorMessage{Code: code, Message: message})
	_ = dispatcher.BroadcastMessage(protocol.OpError, data, []runtime.Presence{p}, nil, true)
}
