package holdem

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/antibot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/bot"
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

type MatchState struct {
	Table            *poker.Table
	Phase            poker.HandPhase
	PendingShowdown  *PendingShowdown
	Audit            audit.Emitter
	MatchID          string
	RoomID           string
	ClubID           string
	TournamentID     string
	SmallBlind       int64
	BigBlind         int64
	Ante             int64
	// Initial* capture the table's configured allocations at creation. Host
	// overrides (set_blinds, pause) only take effect while the host is present
	// AT the table; when the host is absent the table reverts to these initial
	// rules. Never overwritten after MatchInit.
	InitialSmallBlind int64
	InitialBigBlind   int64
	InitialAnte       int64
	BuyIn            int64
	MinBuyIn         int64 // table minimum buy-in / rebuy (0 => BuyIn)
	MaxBuyIn         int64 // table maximum buy-in (0 => 3x BuyIn)
	Presences        map[string]runtime.Presence
	// SeatWallet remembers which wallet each seat's buy-in was drawn from
	// ("global" | "club") so cash-out/refund returns chips to the SAME wallet.
	SeatWallet       map[int]string
	BotCount         int
	Rand             *rand.Rand
	// Per-session AES-256-GCM keys (userID -> 32 raw bytes) used to encrypt each
	// player's own hole cards so the wire never carries plaintext card codes.
	SessionKeys      map[string][]byte
	// Self-managing table lifecycle (no operator babysitting):
	DurationSecs     int   // auto-close after this many seconds (0 = no limit)
	MinPlayers       int   // players required before hands auto-start (default 2)
	AutoDeal         bool  // auto-start each hand (cash tables); tournaments deal via director
	NextDealTick     int64 // tick at which to auto-deal the next hand (0 = unset)
	// Host controls (the table creator can pause/kick/adjust/close live):
	HostUserID       string
	HostPaused       bool
	HostClosed       bool
	// AdminPaused is a platform-admin freeze (tables_freeze_all). Unlike HostPaused
	// it is honored regardless of host presence — it's an operator override.
	AdminPaused      bool
	// Human action clock: when the seat to act is a human, ActionDeadlineTick is
	// the tick by which they must act before the server auto-checks/folds them.
	ActionDeadlineTick int64
	ActionDeadlineSeat int
	// TimeBank is each human's remaining banked seconds (userID -> secs), burned
	// only after the base ActionSecs lapses, before the server auto-folds. Granted
	// once when a player first sits; not auto-refilled.
	TimeBank         map[string]int64
	// Per-table shot-clock config (0 => server defaults): ActionSecsCfg is the base
	// clock in seconds; TimeBankGrant is the one-time bank granted on sit.
	ActionSecsCfg    int
	TimeBankGrant    int64
	// Per-hand behavioural tracking (userID -> counters), reset each hand start
	// and drained into poker_hand_stats at settlement. Feeds VPIP/PFR/AF.
	HandTrack        map[string]*playerHandTrack
	// AntibotLog is a rolling window of each human's recent actions, scored at
	// settlement so bot-likelihood accrues from LIVE play (previously the scorer
	// only ran when an admin hand-posted action batches). Capped per user.
	AntibotLog       map[string][]antibot.ActionRecord
	// Optional table features (#41), all per-hand and reset at hand start:
	RITAgree         map[string]bool             // userID -> agreed to run it twice
	Insurance        map[string]insurancePolicy  // userID -> accepted all-in insurance
	InsOffered       map[string]insurancePolicy  // userID -> standing (unaccepted) offer
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

type Handler struct{}

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
	// Seed AI opponents at creation (server-authoritative, like OddSlingers).
	for i := 0; i < numBots; i++ {
		seat := table.FirstEmptySeat()
		if seat < 0 {
			break
		}
		_ = table.SitDownBot(seat, fmt.Sprintf("bot_%s_%d", roomID, seat), fmt.Sprintf("Bot_%d", i+1), poker.ClampBuyIn(buyIn))
	}
	state := &MatchState{
		Table:        table,
		BotCount:     numBots,
		Phase:        poker.PhaseWaiting,
		Audit: audit.MultiEmitter{Sinks: []audit.Emitter{
			audit.NewPostgresEmitter(db),
			audit.NewArweaveEmitter(),
		}},
		RoomID:       roomID,
		ClubID:       clubID,
		TournamentID: tournamentID,
		SmallBlind:   sb,
		BigBlind:     bb,
		// Snapshot the configured allocations so host overrides can be reverted
		// when the host leaves the table (see hostPresent / effSmallBlind).
		InitialSmallBlind: sb,
		InitialBigBlind:   bb,
		BuyIn:        buyIn,
		MinBuyIn:     minBuyIn,
		MaxBuyIn:     maxBuyIn,
		Presences:    map[string]runtime.Presence{},
		SeatWallet:   map[int]string{},
		Rand:         rand.New(rand.NewSource(time.Now().UnixNano())),
		SessionKeys:  map[string][]byte{},
		RITAgree:     map[string]bool{},
		Insurance:    map[string]insurancePolicy{},
		InsOffered:   map[string]insurancePolicy{},
		AntibotLog:   map[string][]antibot.ActionRecord{},
		TimeBank:     map[string]int64{},
		ActionSecsCfg: actionSecsCfg,
		TimeBankGrant: timeBankCfg,
		DurationSecs: durationSecs,
		MinPlayers:   minPlayers,
		// Cash tables deal themselves (no operator babysitting); tournament tables
		// are driven by the tournament director, so they opt out.
		AutoDeal:     tournamentID == "",
		HostUserID:   hostUserID,
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

func (h *Handler) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
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

func (h *Handler) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	seatReg := store.NewActiveSeatStore(db)
	for _, p := range presences {
		delete(s.Presences, p.GetUserId())
		for i, seat := range s.Table.Seats {
			if seat != nil && seat.UserID == p.GetUserId() {
				s.Table.StandUp(i)
			}
		}
		_ = seatReg.Unregister(ctx, p.GetUserId(), matchIDForAudit(s))
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
		if s.HostClosed {
			closeTable(ctx, db, dispatcher, s, "closed by host")
			return nil
		}
		if s.DurationSecs > 0 && tick >= int64(s.DurationSecs) {
			closeTable(ctx, db, dispatcher, s, "scheduled time reached")
			return nil // ending the match releases the handler
		}
		if s.AutoDeal && !s.effPaused() && !s.AdminPaused && s.Table.SeatedCount() >= s.minToStart() && len(s.Presences) >= 1 {
			if s.NextDealTick == 0 {
				s.NextDealTick = tick + autoDealDelayTicks
			} else if tick >= s.NextDealTick {
				s.NextDealTick = 0
				autoStartHand(ctx, db, dispatcher, s)
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
			msg.GetOpCode() != protocol.OpChatSend &&
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
			buyIn := s.BuyIn
			if req.BuyIn > 0 {
				buyIn = req.BuyIn
			}
			// Enforce the table's buy-in band: [MinBuyIn, MaxBuyIn]. A rebuy after
			// busting must be at least the minimum.
			if buyIn < s.minBuyIn() {
				buyIn = s.minBuyIn()
			}
			if buyIn > s.maxBuyIn() {
				buyIn = s.maxBuyIn()
			}
			buyIn = poker.ClampBuyIn(buyIn)
			// Responsible-gambling gate: a player who has self-excluded or is in a
			// cool-off window cannot take a seat until it lifts. (Set via
			// rg_self_exclude / rg_cool_off — previously stored but never enforced.)
			if blocked, kind, until, _ := store.NewResponsibleStore(db).IsRestricted(ctx, userID); blocked {
				sendError(dispatcher, presence, "rg_"+kind,
					fmt.Sprintf("you are in a %s period until %s", strings.ReplaceAll(kind, "_", "-"), until.Format("Jan 2, 2006")))
				continue
			}
			// Tier gate: enforce the multi-table limit (tables seated at once).
			seatReg := store.NewActiveSeatStore(db)
			matchKey := matchIDForAudit(s)
			if !seatReg.IsSeated(ctx, userID, matchKey) {
				limit := billing.GetTierDef(store.SubscriptionTier(ctx, db, userID)).MultiTableLimit
				if cnt, _ := seatReg.Count(ctx, userID); limit > 0 && cnt >= limit {
					sendError(dispatcher, presence, "multi_table_limit", "you have reached your plan's simultaneous-table limit")
					continue
				}
			}
			wallet := reserveBuyIn(ctx, db, s, userID, buyIn, req.Wallet)
			if wallet == "" {
				sendError(dispatcher, presence, "buy_in_failed", "not enough funds in the selected wallet")
				continue
			}
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			if err := s.Table.SitDown(req.Seat, userID, username, buyIn); err != nil {
				releaseBuyIn(ctx, db, s, req.Seat, userID, buyIn)
				sendError(dispatcher, presence, "sit_failed", err.Error())
				continue
			}
			s.SeatWallet[req.Seat] = wallet
			if s.TimeBank == nil {
				s.TimeBank = map[string]int64{}
			}
			if _, ok := s.TimeBank[userID]; !ok {
				s.TimeBank[userID] = s.timeBankGrant() // one-time grant per player
			}
			// If a hand is already in progress, the new player sits out until it
			// finishes (folded = excluded from the current pot/showdown). The next
			// ResetBetweenHands restores them to Seated so they are dealt in.
			if s.Phase != poker.PhaseWaiting && s.Table.Seats[req.Seat] != nil {
				s.Table.Seats[req.Seat].Status = poker.SeatFolded
			}
			_ = seatReg.Register(ctx, userID, matchKey)
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpStandUp:
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					releaseBuyIn(ctx, db, s, i, userID, seat.Stack)
					delete(s.SeatWallet, i)
					s.Table.StandUp(i)
					break
				}
			}
			_ = store.NewActiveSeatStore(db).Unregister(ctx, userID, matchIDForAudit(s))
			dispatcher.MatchLabelUpdate(buildLabel(s))
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
			if s.HostUserID == "" || userID != s.HostUserID {
				sendError(dispatcher, presence, "not_host", "only the table host can do that")
				continue
			}
			handleHostAction(ctx, db, dispatcher, s, msg.GetData())

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
			handleInsuranceAccept(ctx, db, dispatcher, s, userID, presence, msg.GetData())

		case protocol.OpStartHand:
			if s.Table.SeatedCount() >= s.minToStart() && s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
				if err := s.Table.StartHand(s.effSmallBlind(), s.effBigBlind()); err != nil {
					sendError(dispatcher, presence, "engine_unavailable", err.Error())
					continue
				}
				s.Phase = poker.PhaseBetting
				emitHandStarted(ctx, s)
				narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.effSmallBlind()/100, s.effBigBlind()/100))
				broadcastHandStart(ctx, db, dispatcher, s)
				dealAndBeginBetting(ctx, db, dispatcher, s)
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
			if err := s.Table.ApplyAction(seatIdx, req.Type, req.Amount); err != nil {
				sendError(dispatcher, presence, "action_failed", err.Error())
				continue
			}
			emitPlayerAction(ctx, s, userID, req.Type, req.Amount)
			narrateAction(dispatcher, s, seatIdx, req.Type)
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

			if _, uncontested := s.Table.UncontestedWinner(); uncontested {
				beginShowdownResolution(ctx, s)
				broadcastSnapshot(ctx, db, dispatcher, s, nil)
				continue
			}

			showdown := s.Table.AdvanceAction()
			if showdown {
				beginShowdownResolution(ctx, s)
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
	driveBots(ctx, db, dispatcher, s)
	// Then enforce the human action clock so an AFK/disconnected player can't
	// freeze the table.
	enforceActionDeadline(ctx, db, dispatcher, s, tick)
	return s
}

// enforceActionDeadline auto-acts for a human who has been sitting on their turn
// past actionTimeoutTicks (check if free, else fold), then progresses the hand
// exactly as a real action would. Bots act via driveBots and are never subject to
// this. The deadline is (re)armed the first tick a given human seat is to act.
func enforceActionDeadline(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, tick int64) {
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
	emitPlayerAction(ctx, s, seat.UserID, action, 0)
	narrateAction(dispatcher, s, seatIdx, action)
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	if _, uncontested := s.Table.UncontestedWinner(); uncontested {
		beginShowdownResolution(ctx, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	if s.Table.AdvanceAction() {
		beginShowdownResolution(ctx, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	if len(s.Table.Board) > 0 {
		broadcastBoard(dispatcher, s)
	}
	broadcastActionRequired(ctx, db, dispatcher, s)
	// A bot may now be first to act on the new street.
	driveBots(ctx, db, dispatcher, s)
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
func driveBots(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
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

		emitPlayerAction(ctx, s, seat.UserID, action, amount)
		narrateAction(dispatcher, s, seatIdx, action)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)

		if _, uncontested := s.Table.UncontestedWinner(); uncontested {
			beginShowdownResolution(ctx, s)
			broadcastSnapshot(ctx, db, dispatcher, s, nil)
			return
		}
		if s.Table.AdvanceAction() {
			beginShowdownResolution(ctx, s)
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

func beginShowdownResolution(ctx context.Context, s *MatchState) {
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
	emitSidePotsPlanned(ctx, s, plan)
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
func handleInsuranceAccept(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, userID string, presence runtime.Presence, data []byte) {
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
	_ = store.NewInsuranceStore(db).RecordAccepted(ctx, matchIDForAudit(s), s.Table.HandNo, userID, policy.Premium, policy.Payout, policy.Equity)
	narrate(dispatcher, s, fmt.Sprintf("%s took insurance on their all-in.", displayName(s, userID)))
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

// settleInsurance pays out accepted policies whose holder lost the hand and marks
// every policy resolved. Called at showdown before seats reset, using the winner
// seats from the resolution. Wallet-only; independent of pot settlement.
func settleInsurance(ctx context.Context, db *sql.DB, s *MatchState, res poker.ShowdownResult) {
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
			// Lost the hand — pay the insurance payout to their wallet.
			_ = store.NewWalletStore(db).Credit(ctx, userID, policy.Payout, "insurance_payout")
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
			standUpBusted(s)
			s.Phase = poker.PhaseWaiting
			return true
		}

		winners, _ := poker.ApplyResolutions(s.Table, res.Resolutions)
		if err := emitHandSettled(ctx, s, res, potBefore, plan); err != nil {
			logger.Error("audit hand_settled: %v", err)
		}
		if err := broadcastShowdownFromResult(ctx, db, dispatcher, s, winners, res, potBefore); err != nil {
			logger.Error("broadcast showdown: %v", err)
		}
		recordWinnings(ctx, nk, s, res)
		creditRake(ctx, db, s, potBefore)
		accrueLoyalty(ctx, db, nk, s, res) // HRP + achievements (before seats reset)
		// Run-it-twice: persist the dealt boards (audit/replay). All-in insurance:
		// pay out policies whose holder lost. Both run before ResetBetweenHands
		// while seat/winner state is still intact; both are wallet/record only and
		// never touch the settled pot.
		if len(res.Boards) > 0 {
			_ = store.NewRunItTwiceStore(db).Record(ctx, matchIDForAudit(s), s.Table.HandNo, boardStrings(res.Boards))
		}
		settleInsurance(ctx, db, s, res)
		// Per-hand analytics + mission progress (best-effort; must not break the
		// match loop). Uses seat state before ResetBetweenHands clears it.
		attributeHand(ctx, logger, db, s, res, plan, potBefore)
		// TODO(league-accrual): fan out league-standing accrual (store.LeagueStore.
		// AccrueStanding) and club-war per-hand settlement (store.ClubWarStore.AddHand,
		// keyed off a war_id match param) from here. Deferred out of the match hot path
		// to avoid destabilizing the handler: standings and war scores are currently
		// driven by the admin RPCs (league_standings_set, clubwar_result). Wiring this
		// safely requires a war_id/league_id match label + per-seat club resolution and
		// a single batched write, tracked as the unified attributeHand() hook in the plan.
		s.Table.ResetBetweenHands()
		reportTournamentBusts(ctx, db, nk, s)
		standUpBusted(s) // cash tables: clear felted players so the table stays playable
		s.Phase = poker.PhaseWaiting
		return true
	default:
		return false
	}
}

// autoStartHand deals the next hand on a self-managing cash table (mirrors the
// manual OpStartHand path). Bots are driven by the loop's trailing driveBots.
func autoStartHand(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	if s.Table.SeatedCount() < 2 || s.Phase != poker.PhaseWaiting || s.Table.Street != poker.StreetWaiting {
		return
	}
	if err := s.Table.StartHand(s.effSmallBlind(), s.effBigBlind()); err != nil {
		return // engine-math unavailable; retry next tick
	}
	s.Phase = poker.PhaseBetting
	emitHandStarted(ctx, s)
	narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.effSmallBlind()/100, s.effBigBlind()/100))
	broadcastHandStart(ctx, db, dispatcher, s)
	dealAndBeginBetting(ctx, db, dispatcher, s)
}

// dealAndBeginBetting sends hole cards and opens the first betting round. It also
// covers the bomb-pot case, where StartHand has already dealt the flop (so the
// board must be broadcast) and — in the rare event every seated player is all-in
// for the ante — advances straight to showdown resolution.
func dealAndBeginBetting(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	dealPrivateCards(dispatcher, s)
	if len(s.Table.Board) > 0 { // bomb pot: flop is already out
		broadcastBoard(dispatcher, s)
	}
	if s.Table.ActionSeat < 0 {
		beginShowdownResolution(ctx, s)
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
		return
	}
	broadcastActionRequired(ctx, db, dispatcher, s)
}

// handleHostAction applies a host-only table control. Blind/close changes take
// effect between hands; pause stops new hands being auto-dealt; kick stands a
// player up (refunding their stack). The caller has already verified the sender
// is the host.
func handleHostAction(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, data []byte) {
	var req struct {
		Action     string `json:"action"`
		Seat       int    `json:"seat"`
		ToSeat     int    `json:"to_seat"`
		SmallBlind int64  `json:"small_blind"`
		BigBlind   int64  `json:"big_blind"`
		Ante       int64  `json:"ante"`
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
		s.HostClosed = true
		narrate(dispatcher, s, "Host is closing the table…")
	case "kick":
		seat := s.Table.Seats[req.Seat]
		if req.Seat >= 0 && req.Seat < poker.MaxSeats && seat != nil && !seat.IsBot {
			releaseBuyIn(ctx, db, s, req.Seat, seat.UserID, seat.Stack)
			delete(s.SeatWallet, req.Seat)
			_ = store.NewActiveSeatStore(db).Unregister(ctx, seat.UserID, matchIDForAudit(s))
			name := seat.Username
			s.Table.StandUp(req.Seat)
			narrate(dispatcher, s, fmt.Sprintf("Host removed %s from the table.", name))
		}
	case "set_blinds":
		if req.SmallBlind > 0 && req.BigBlind >= req.SmallBlind {
			s.SmallBlind = req.SmallBlind
			s.BigBlind = req.BigBlind
			narrate(dispatcher, s, fmt.Sprintf("Host set blinds to $%d/$%d (from the next hand).", req.SmallBlind/100, req.BigBlind/100))
		}
	case "force_fold":
		// Fold the seat currently on the clock (dispute / stalling / disconnect).
		// Only the acting seat can be folded without corrupting hand state.
		if s.Phase == poker.PhaseBetting && s.Table.ActionSeat == req.Seat {
			seat := seatIdxSeat(s, req.Seat)
			if seat != nil && !seat.IsBot {
				if err := s.Table.ApplyAction(req.Seat, "fold", 0); err == nil {
					s.ActionDeadlineTick, s.ActionDeadlineSeat = 0, -1
					emitPlayerAction(ctx, s, seat.UserID, "fold", 0)
					narrate(dispatcher, s, fmt.Sprintf("Host folded %s's hand.", seat.Username))
					broadcastSnapshot(ctx, db, dispatcher, s, nil)
					if _, uncontested := s.Table.UncontestedWinner(); uncontested {
						beginShowdownResolution(ctx, s)
					} else if s.Table.AdvanceAction() {
						beginShowdownResolution(ctx, s)
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
				wallet := s.SeatWallet[req.Seat]
				if err := s.Table.MoveSeat(req.Seat, req.ToSeat); err == nil {
					delete(s.SeatWallet, req.Seat)
					if wallet != "" {
						s.SeatWallet[req.ToSeat] = wallet
					}
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
func closeTable(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, reason string) {
	seatReg := store.NewActiveSeatStore(db)
	for i, seat := range s.Table.Seats {
		if seat == nil {
			continue
		}
		if !seat.IsBot {
			releaseBuyIn(ctx, db, s, i, seat.UserID, seat.Stack)
			delete(s.SeatWallet, i)
			_ = seatReg.Unregister(ctx, seat.UserID, matchIDForAudit(s))
		}
		s.Table.StandUp(i)
	}
	narrate(dispatcher, s, "Table closed — "+reason+". Remaining chips returned to your wallet.")
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

func matchIDForAudit(s *MatchState) string {
	if s.MatchID != "" {
		return s.MatchID
	}
	return s.RoomID
}

func emitHandStarted(ctx context.Context, s *MatchState) {
	// Start a fresh per-hand behavioural tracker (VPIP/PFR/AF derivation).
	s.HandTrack = map[string]*playerHandTrack{}
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
		"hand_no":           s.Table.HandNo,
		"small_blind":       s.effSmallBlind(),
		"big_blind":         s.effBigBlind(),
		"seated":            s.Table.SeatedCount(),
		"board":             boardCodes,
		"deck_commit_hash":  s.Table.DeckCommitment,
	}
	_ = s.Audit.Emit(ctx, audit.Event{
		Type:        "hand_started",
		MatchID:     matchIDForAudit(s),
		HandNo:      s.Table.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	})
}

func emitSidePotsPlanned(ctx context.Context, s *MatchState, plan poker.ShowdownPlan) {
	if s.Audit == nil {
		return
	}
	layers := make([]map[string]any, 0, len(plan.Pots))
	for i, pot := range plan.Pots {
		layers = append(layers, map[string]any{
			"index":     i,
			"amount":    pot.Amount,
			"eligible":  pot.Eligible,
		})
	}
	payload := map[string]any{
		"hand_no":             plan.HandNo,
		"total_pot":           plan.TotalPot,
		"side_pots":           layers,
		"uncontested_winner":  plan.UncontestedWinner,
	}
	_ = s.Audit.Emit(ctx, audit.Event{
		Type:        "sidepots_planned",
		MatchID:     matchIDForAudit(s),
		HandNo:      plan.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	})
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

func emitPlayerAction(ctx context.Context, s *MatchState, userID, action string, amount int64) {
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
	_ = s.Audit.Emit(ctx, audit.Event{
		Type:        "player_action",
		MatchID:     matchIDForAudit(s),
		HandNo:      s.Table.HandNo,
		RoomID:      s.RoomID,
		ClubID:      s.ClubID,
		Payload:     payload,
		PayloadHash: audit.HashPayload(payload),
	})
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
// ("global" | "club" | "tournament"), or "" on failure (insufficient funds).
// At a club table the club-issued balance is used unless the player picked
// "global" AND the club accepts it.
func reserveBuyIn(ctx context.Context, db *sql.DB, s *MatchState, userID string, amount int64, wallet string) string {
	amount = poker.ClampBuyIn(amount)
	if s.TournamentID != "" {
		return "tournament" // director-managed; no wallet debit
	}
	if s.ClubID != "" {
		if wallet == "global" && clubAcceptsGlobal(ctx, db, s.ClubID) {
			if err := store.NewWalletStore(db).Debit(ctx, userID, amount, "table_buyin"); err != nil {
				return ""
			}
			return "global"
		}
		if err := store.NewClubStore(db).LockBalance(ctx, s.ClubID, userID, amount); err != nil {
			return ""
		}
		return "club"
	}
	if err := store.NewWalletStore(db).Debit(ctx, userID, amount, "table_buyin"); err != nil {
		return ""
	}
	return "global"
}

// releaseBuyIn returns chips to the SAME wallet the seat bought in from.
func releaseBuyIn(ctx context.Context, db *sql.DB, s *MatchState, seat int, userID string, amount int64) {
	if amount <= 0 || s.TournamentID != "" {
		return
	}
	wallet := ""
	if s.SeatWallet != nil {
		wallet = s.SeatWallet[seat]
	}
	if wallet == "club" && s.ClubID != "" {
		_ = store.NewClubStore(db).UnlockBalance(ctx, s.ClubID, userID, amount)
		return
	}
	// "global", non-club tables, or unknown -> the global wallet.
	_ = store.NewWalletStore(db).Credit(ctx, userID, amount, "table_cashout")
}

func creditRake(ctx context.Context, db *sql.DB, s *MatchState, pot int64) {
	if s.ClubID == "" || pot <= 0 {
		return
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, s.ClubID)
	if err != nil || rake == nil {
		return
	}
	if rake.NoFlopNoDrop && len(s.Table.Board) == 0 {
		return
	}
	if pot < rake.MinPotMinor {
		return
	}
	rakeAmount := pot * int64(rake.PercentBps) / 10000
	if rake.CapMinor > 0 && rakeAmount > rake.CapMinor {
		rakeAmount = rake.CapMinor
	}
	if rakeAmount <= 0 {
		return
	}
	_ = store.NewRakeStore(db).Credit(ctx, s.ClubID, rakeAmount, s.MatchID, s.Table.HandNo)
	accrueRakeback(ctx, db, s, rakeAmount)
}

// accrueRakeback distributes rakeback to the human contributors of the raked
// pot, proportional to each one's contribution, at their membership tier's
// rakeback percent. Bots (no tier) are skipped.
func accrueRakeback(ctx context.Context, db *sql.DB, s *MatchState, rakeAmount int64) {
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
			_ = rb.Accrue(ctx, seat.UserID, amount)
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

// standUpBusted removes any seat with no chips left after a hand settles. On a
// cash table a felted player (bot or human) must leave the seat — leaving them
// seated at $0 wastes a seat and, before the allMatched() fix, could deadlock the
// betting round. Tournaments keep busted seats for elimination reporting.
func standUpBusted(s *MatchState) {
	if s.TournamentID != "" {
		return
	}
	for i, seat := range s.Table.Seats {
		if seat != nil && seat.Stack <= 0 {
			s.Table.StandUp(i)
		}
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
		for i, seat := range s.Table.Seats {
			if seat != nil && seat.Stack <= 0 {
				s.Table.StandUp(i)
			}
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "close":
		// Admin-initiated teardown (admin_table_close RPC). Flag the table so the
		// loop closes it between hands — refunding seated stacks without abandoning
		// a live pot. If already idle, close immediately.
		s.HostClosed = true
		narrate(dispatcher, s, "An administrator is closing this table…")
		if s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
			closeTable(ctx, db, dispatcher, s, "closed by an administrator")
			return nil, ""
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	case "add_bot":
		seatIdx := s.Table.FirstEmptySeat()
		if seatIdx >= 0 {
			s.BotCount++
			buyIn := poker.ClampBuyIn(s.BuyIn)
			name := fmt.Sprintf("Bot_%d", s.BotCount)
			botID := fmt.Sprintf("bot_%s_%d", s.RoomID, seatIdx)
			if err := s.Table.SitDownBot(seatIdx, botID, name, buyIn); err == nil {
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
		MatchID:        s.MatchID,
		RoomID:         s.RoomID,
		MinBuyIn:            s.minBuyIn(),
		MaxBuyIn:            s.maxBuyIn(),
		AcceptsGlobalWallet: acceptsGlobal,
		HeroClubBalance:     heroClubBalance,
		Phase:          poker.HandPhaseForTable(s.Table, s.Phase),
		Seats:          seats,
		Board:          board,
		Pot:            s.Table.Pot,
		CurrentBet:     s.Table.CurrentBet,
		ActionSeat:     s.Table.ActionSeat,
		ButtonSeat:     s.Table.ButtonSeat,
		SmallBlind:     s.effSmallBlind(),
		BigBlind:       s.effBigBlind(),
		MaxSeats:       s.Table.Cap(),
		HeroWallet:     heroWallet,
		HandNo:         s.Table.HandNo,
		DeckCommitHash: s.Table.DeckCommitment,
		Variant:        s.Table.Variant,
		HostUserID:     s.HostUserID,
		HostPaused:     s.effPaused() || s.AdminPaused,
		AllowStraddle:   s.Table.AllowStraddle,
		AllowBombPot:    s.Table.AllowBombPot,
		AllowInsurance:  s.Table.AllowInsurance,
		AllowRunItTwice: s.Table.AllowRunItTwice,
		StraddleArmed:   s.Table.StraddleRequested,
	}
}

func broadcastSnapshot(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, sender runtime.Presence) {
	for userID, p := range s.Presences {
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
	reveal := map[string][]protocol.CardView{}
	for userID, cards := range s.Table.HoleCards {
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

// narrate emits a dealer play-by-play line to everyone at the table.
func narrate(dispatcher runtime.MatchDispatcher, s *MatchState, text string) {
	broadcastChat(dispatcher, s, protocol.ChatMessage{
		Username: "Dealer",
		Text:     text,
		Kind:     "dealer",
		HandNo:   s.Table.HandNo,
	})
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

func boardCodesSpaced(board []poker.Card) string {
	parts := make([]string, 0, len(board))
	for _, c := range board {
		parts = append(parts, c.Code())
	}
	return strings.Join(parts, " ")
}

func sendError(dispatcher runtime.MatchDispatcher, p runtime.Presence, code, message string) {
	data, _ := json.Marshal(protocol.ErrorMessage{Code: code, Message: message})
	_ = dispatcher.BroadcastMessage(protocol.OpError, data, []runtime.Presence{p}, nil, true)
}
