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

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/bot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/loyalty"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
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
	BuyIn            int64
	Presences        map[string]runtime.Presence
	BotCount         int
	Rand             *rand.Rand
	// Per-session AES-256-GCM keys (userID -> 32 raw bytes) used to encrypt each
	// player's own hole cards so the wire never carries plaintext card codes.
	SessionKeys      map[string][]byte
	// Self-managing table lifecycle (no operator babysitting):
	DurationSecs     int   // auto-close after this many seconds (0 = no limit)
	AutoDeal         bool  // auto-start each hand (cash tables); tournaments deal via director
	NextDealTick     int64 // tick at which to auto-deal the next hand (0 = unset)
	// Host controls (the table creator can pause/kick/adjust/close live):
	HostUserID       string
	HostPaused       bool
	HostClosed       bool
}

// autoDealDelayTicks is the breather between hands on a self-dealing table
// (MatchInit sets tick rate = 1/s, so this is seconds).
const autoDealDelayTicks = 4

type Handler struct{}

func (h *Handler) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	roomID := "room"
	clubID := ""
	if v, ok := params["small_blind"].(float64); ok {
		sb = int64(v)
	}
	if v, ok := params["big_blind"].(float64); ok {
		bb = int64(v)
	}
	if v, ok := params["buy_in"].(float64); ok {
		buyIn = int64(v)
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
	if v, ok := params["max_seats"].(float64); ok && v >= 2 {
		maxSeats = int(v)
	}
	numBots := 0
	if v, ok := params["num_bots"].(float64); ok && v > 0 {
		numBots = int(v)
	}
	if numBots > maxSeats-1 {
		numBots = maxSeats - 1
	}
	durationSecs := 0
	if v, ok := params["duration_secs"].(float64); ok && v > 0 {
		durationSecs = int(v)
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
		BuyIn:        buyIn,
		Presences:    map[string]runtime.Presence{},
		Rand:         rand.New(rand.NewSource(time.Now().UnixNano())),
		SessionKeys:  map[string][]byte{},
		DurationSecs: durationSecs,
		// Cash tables deal themselves (no operator babysitting); tournament tables
		// are driven by the tournament director, so they opt out.
		AutoDeal:     tournamentID == "",
		HostUserID:   hostUserID,
	}
	label := buildLabel(state)
	return state, 1, label
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
		if s.AutoDeal && !s.HostPaused && s.Table.SeatedCount() >= 2 && len(s.Presences) >= 1 {
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
		if !s.Phase.AllowsPlayerActions() &&
			msg.GetOpCode() != protocol.OpStandUp && msg.GetOpCode() != protocol.OpChatSend {
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
			buyIn := poker.ClampBuyIn(s.BuyIn)
			if req.BuyIn > 0 {
				buyIn = poker.ClampBuyIn(req.BuyIn)
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
			if err := reserveBuyIn(ctx, db, s, userID, buyIn); err != nil {
				sendError(dispatcher, presence, "buy_in_failed", err.Error())
				continue
			}
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			if err := s.Table.SitDown(req.Seat, userID, username, buyIn); err != nil {
				releaseBuyIn(ctx, db, s.ClubID, userID, buyIn)
				sendError(dispatcher, presence, "sit_failed", err.Error())
				continue
			}
			_ = seatReg.Register(ctx, userID, matchKey)
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpStandUp:
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					releaseBuyIn(ctx, db, s.ClubID, userID, seat.Stack)
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

		case protocol.OpStartHand:
			if s.Table.SeatedCount() >= 2 && s.Phase == poker.PhaseWaiting && s.Table.Street == poker.StreetWaiting {
				if err := s.Table.StartHand(s.SmallBlind, s.BigBlind); err != nil {
					sendError(dispatcher, presence, "engine_unavailable", err.Error())
					continue
				}
				s.Phase = poker.PhaseBetting
				emitHandStarted(ctx, s)
				narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.SmallBlind/100, s.BigBlind/100))
				broadcastHandStart(ctx, db, dispatcher, s)
				dealPrivateCards(dispatcher, s)
				broadcastActionRequired(ctx, db, dispatcher, s)
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
		}
	}

	// After human input, let any bot(s) whose turn it is act.
	driveBots(ctx, db, dispatcher, s)
	return s
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

func beginShowdownResolution(ctx context.Context, s *MatchState) {
	if s.Phase == poker.PhaseResolvingSidePots {
		return
	}
	plan := poker.BuildShowdownPlan(s.Table, matchIDForAudit(s))
	s.Phase = poker.PhaseResolvingSidePots
	s.PendingShowdown = &PendingShowdown{
		ResultCh:  poker.StartShowdownAsync(ctx, plan),
		PotBefore: s.Table.Pot,
		Plan:      plan,
	}
	emitSidePotsPlanned(ctx, s, plan)
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
			logger.Error("showdown failed: %v", res.Err)
			s.Phase = poker.PhaseBetting
			for _, p := range s.Presences {
				sendError(dispatcher, p, "showdown_failed", res.Err.Error())
			}
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
		accrueLoyalty(ctx, db, s, res) // HRP + achievements (before seats reset)
		s.Table.ResetBetweenHands()
		s.Phase = poker.PhaseWaiting
		reportTournamentBusts(ctx, db, nk, s)
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
	if err := s.Table.StartHand(s.SmallBlind, s.BigBlind); err != nil {
		return // engine-math unavailable; retry next tick
	}
	s.Phase = poker.PhaseBetting
	emitHandStarted(ctx, s)
	narrate(dispatcher, s, fmt.Sprintf("Hand #%d dealt — blinds $%d/$%d", s.Table.HandNo, s.SmallBlind/100, s.BigBlind/100))
	broadcastHandStart(ctx, db, dispatcher, s)
	dealPrivateCards(dispatcher, s)
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
		SmallBlind int64  `json:"small_blind"`
		BigBlind   int64  `json:"big_blind"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}
	switch req.Action {
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
			releaseBuyIn(ctx, db, s.ClubID, seat.UserID, seat.Stack)
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
			releaseBuyIn(ctx, db, s.ClubID, seat.UserID, seat.Stack)
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
	if s.Audit == nil {
		return
	}
	boardCodes := make([]string, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		boardCodes = append(boardCodes, c.Code())
	}
	payload := map[string]any{
		"hand_no":           s.Table.HandNo,
		"small_blind":       s.SmallBlind,
		"big_blind":         s.BigBlind,
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

func reserveBuyIn(ctx context.Context, db *sql.DB, s *MatchState, userID string, amount int64) error {
	amount = poker.ClampBuyIn(amount)
	if s.TournamentID != "" {
		return nil
	}
	if s.ClubID != "" {
		return store.NewClubStore(db).LockBalance(ctx, s.ClubID, userID, amount)
	}
	return store.NewWalletStore(db).Debit(ctx, userID, amount, "table_buyin")
}

func releaseBuyIn(ctx context.Context, db *sql.DB, clubID, userID string, amount int64) {
	if amount <= 0 {
		return
	}
	if clubID != "" {
		_ = store.NewClubStore(db).UnlockBalance(ctx, clubID, userID, amount)
		return
	}
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
func accrueLoyalty(ctx context.Context, db *sql.DB, s *MatchState, res poker.ShowdownResult) {
	winners := map[int]string{} // seat -> winning hand category
	for _, r := range res.Resolutions {
		for _, seat := range r.Winners {
			winners[seat] = r.HandCats[seat]
		}
	}
	ls := store.NewLoyaltyStore(db)
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
		for _, code := range loyalty.AchievementsForResult(l.HandsPlayed, l.HandsWon, won, cat) {
			if newly, _ := ls.UnlockAchievement(ctx, seat.UserID, code); newly {
				if a, ok := loyalty.Catalog[code]; ok && a.HRP > 0 {
					_, _ = ls.Award(ctx, seat.UserID, a.HRP, 0, 0)
				}
			}
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
				ModelURL:   equippedModelURL(ctx, db, seat.UserID, seat.IsBot),
			}
		}
	}
	board := make([]protocol.CardView, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		board = append(board, protocol.CardView{Code: c.Code(), FaceUp: true})
	}
	heroWallet, _ := store.NewWalletStore(db).Get(ctx, heroID)
	return protocol.TableSnapshot{
		MatchID:        s.MatchID,
		RoomID:         s.RoomID,
		Phase:          poker.HandPhaseForTable(s.Table, s.Phase),
		Seats:          seats,
		Board:          board,
		Pot:            s.Table.Pot,
		CurrentBet:     s.Table.CurrentBet,
		ActionSeat:     s.Table.ActionSeat,
		ButtonSeat:     s.Table.ButtonSeat,
		SmallBlind:     s.SmallBlind,
		BigBlind:       s.BigBlind,
		MaxSeats:       s.Table.Cap(),
		HeroWallet:     heroWallet,
		HandNo:         s.Table.HandNo,
		DeckCommitHash: s.Table.DeckCommitment,
		Variant:        s.Table.Variant,
		HostUserID:     s.HostUserID,
		HostPaused:     s.HostPaused,
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
			if handCat == "" {
				cat, err := poker.HandCategory(seat, s.Table)
				if err != nil {
					return err
				}
				handCat = cat
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
	data, _ := json.Marshal(map[string]interface{}{
		"pot":         pot,
		"hands":       reveal,
		"winners":     winnerViews,
		"side_pots":   len(winnerGroups),
		"deck_commit": s.Table.DeckCommitment, // committed before the deal
		"reveal_seed": s.Table.DeckSeed,       // reveal now — re-run to verify fairness
	})
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
