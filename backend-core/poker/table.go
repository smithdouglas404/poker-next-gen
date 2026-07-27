package poker

import (
	"fmt"
)

type Card struct {
	Rank int // 2-14 (Ace=14)
	Suit int // 0-3
}

func (c Card) Code() string {
	ranks := map[int]string{14: "A", 13: "K", 12: "Q", 11: "J", 10: "T"}
	r := ranks[c.Rank]
	if r == "" {
		r = fmt.Sprintf("%d", c.Rank)
	}
	suits := []string{"s", "h", "d", "c"}
	return r + suits[c.Suit]
}

func NewDeck() (deck []Card, commitment, seed string, order []string, err error) {
	return NewSecureDeck()
}

// MaxSeats is the physical seat cap; a table's active seats (2..MaxSeats) are
// configurable at creation. 9 supports full-ring; 6-max stays the default.
const MaxSeats = 10

type SeatStatus string

const (
	SeatEmpty   SeatStatus = "empty"
	SeatSeated  SeatStatus = "seated"
	SeatFolded  SeatStatus = "folded"
	SeatAllIn   SeatStatus = "all_in"
)

type Seat struct {
	Index            int
	UserID           string
	Username         string
	Stack            int64
	Bet              int64
	TotalContributed int64
	Status           SeatStatus
	LastAction       string
	IsBot            bool
	// Cash-game blind-correctness state (persists across hands, so it must NOT be a
	// SeatStatus — ResetBetweenHands rewrites Status every hand). SittingOut: in the
	// seat but out of the game. OwesPost: joined/returned after the game started and
	// must post (dead SB + live BB) to be dealt before their natural big blind — the
	// "no buying the button" rule. PostNow: the player elected to post immediately on
	// the next hand rather than wait for the big blind (consumed in StartHand).
	SittingOut bool
	OwesPost   bool
	PostNow    bool
}

type Street string

const (
	StreetWaiting Street = "waiting"
	StreetPreflop Street = "preflop"
	StreetFlop    Street = "flop"
	StreetTurn    Street = "turn"
	StreetRiver   Street = "river"
	StreetShowdown Street = "showdown"
)

// Variant identifies the poker game a table plays.
const (
	VariantHoldem = "holdem" // Texas Hold'em (2 hole cards, no-limit)
	VariantPLO    = "plo"    // Pot-Limit Omaha (4 hole cards, pot-limit)
)

type Table struct {
	Seats          [MaxSeats]*Seat
	Deck           []Card
	DeckOrder      []string
	DeckCommitment string // SHA-256(seed) — committed before the deal
	DeckSeed       string // hex seed — revealed only after the hand settles
	Board          []Card
	HoleCards   map[string][]Card
	Pot         int64
	CurrentBet  int64
	MinRaise    int64
	Street      Street
	ButtonSeat  int
	ActionSeat  int
	HandNo      int
	// LastAggressorSeat is the seat of the last aggressive bet/raise in the hand;
	// -1 when the hand was checked down. Drives the showdown show-order (the last
	// aggressor must show first; else the first active seat left of the button).
	LastAggressorSeat int
	// SBSeat / BBSeat are THIS hand's small- and big-blind seat indices (-1 = none/
	// dead). Persisted as the anchors for the forward-moving big blind: next hand's
	// small blind is this hand's BB seat and next hand's button is this hand's SB
	// seat, which lets the button land on an emptied seat (dead button) and the
	// small blind be skipped (dead SB) — standard cash-game rules.
	SBSeat int
	BBSeat int
	ActedThisRound map[int]bool
	SeatCap        int    // configured active seats (2..MaxSeats); 0 => default 6
	Variant        string // "holdem" | "plo"; empty => holdem
	PotLimit       bool   // cap raises to the pot size (PLO)

	// ── Optional table features (#41) ────────────────────────────────────────
	// All default-off and gated so a standard Hold'em/PLO hand is byte-for-byte
	// unchanged when none of these are enabled.

	// Straddle: a voluntary UTG post of 2x BB before the deal; betting reopens
	// from the straddle (the straddler acts last preflop).
	AllowStraddle     bool
	StraddleRequested bool // armed for the next StartHand; consumed there
	StraddleSeat      int  // seat that posted a straddle this hand, else -1

	// Bomb pot: every seated player antes a set amount, preflop betting is
	// skipped, and the hand deals straight to the flop.
	AllowBombPot     bool
	BombPotAnte      int64 // ante per player (0 => one big blind when triggered)
	BombPotRequested bool  // armed for the next StartHand; consumed there

	// Run-it-twice: when all remaining players are all-in and agree, the board is
	// run N times and each pot fraction settled per board. RunItTwice is resolved
	// by the match handler immediately before showdown; the engine only reads it.
	AllowRunItTwice  bool
	RunItTwice       bool
	RunItTwiceBoards int // N (default 2)

	// All-in insurance: offered to an all-in favorite, priced off real equity and
	// settled against the wallet (never the pot). The engine only carries the flag.
	AllowInsurance bool
}

func NewTable() *Table {
	return &Table{
		HoleCards:        map[string][]Card{},
		ActedThisRound:   map[int]bool{},
		Street:           StreetWaiting,
		SeatCap:          6,
		Variant:          VariantHoldem,
		StraddleSeat:     -1,
		SBSeat:           -1,
		BBSeat:           -1,
		RunItTwiceBoards: 2,
	}
}

// SetVariant configures the game variant and its betting mode. Unknown values
// fall back to Hold'em so existing tables are unaffected.
func (t *Table) SetVariant(v string) {
	switch v {
	case VariantPLO:
		t.Variant = VariantPLO
		t.PotLimit = true
	default:
		t.Variant = VariantHoldem
		t.PotLimit = false
	}
}

// IsOmaha reports whether the table uses Omaha (4-card, must-use-2) evaluation.
func (t *Table) IsOmaha() bool { return t.Variant == VariantPLO }

// holeCount is how many hole cards each player is dealt for this variant.
func (t *Table) holeCount() int {
	if t.Variant == VariantPLO {
		return 4
	}
	return 2
}

// potLimitMaxTotal is the largest total bet a raiser may commit under pot-limit
// rules: their current bet + the pot after they call + a pot-sized raise. t.Pot
// already includes every chip bet this street, so the pot after calling is
// t.Pot + toCall and the max raise increment equals that — giving
// s.Bet + t.Pot + 2*toCall.
func (t *Table) potLimitMaxTotal(s *Seat, toCall int64) int64 {
	return s.Bet + t.Pot + 2*toCall
}

// cap returns the configured number of active seats, clamped to [2, MaxSeats].
func (t *Table) cap() int {
	if t.SeatCap < 2 {
		return 6
	}
	if t.SeatCap > MaxSeats {
		return MaxSeats
	}
	return t.SeatCap
}

// SetSeatCap configures how many seats (2..MaxSeats) this table exposes.
func (t *Table) SetSeatCap(n int) {
	if n < 2 {
		n = 2
	}
	if n > MaxSeats {
		n = MaxSeats
	}
	t.SeatCap = n
}

// Cap is the exported active-seat count for snapshots/labels.
func (t *Table) Cap() int { return t.cap() }

func (t *Table) SeatedCount() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && s.Status != SeatEmpty {
			n++
		}
	}
	return n
}

// SitDown seats a player, clamping the buy-in to [MinBuyInCents, MaxBuyInCents].
func (t *Table) SitDown(seat int, userID, username string, buyIn int64) error {
	return t.sitDown(seat, userID, username, buyIn, false)
}

// SitDownUnlimited is SitDown without the MaxBuyInCents cap, for tables
// configured "Unlimited buy-in (play money)" (MatchState.NoMaxBuyIn — real-money
// tables can never set it). The floor still applies.
//
// The caller (reserveBuyIn) must clamp the SAME way before debiting the wallet —
// this function does not know what was actually charged, only what the seat
// should show. A mismatch between the two would mean either the wallet is
// charged more than the stack the player receives (money destroyed) or the
// stack shows more than was ever charged (chips minted from nothing).
func (t *Table) SitDownUnlimited(seat int, userID, username string, buyIn int64) error {
	return t.sitDown(seat, userID, username, buyIn, true)
}

func (t *Table) sitDown(seat int, userID, username string, buyIn int64, allowUnlimited bool) error {
	if seat < 0 || seat >= t.cap() {
		return fmt.Errorf("invalid seat")
	}
	if t.Seats[seat] != nil {
		return fmt.Errorf("seat taken")
	}
	buyIn = ClampBuyInBand(buyIn, allowUnlimited)
	t.Seats[seat] = &Seat{
		Index:    seat,
		UserID:   userID,
		Username: username,
		Stack:    buyIn,
		Status:   SeatSeated,
	}
	return nil
}

func (t *Table) StandUp(seat int) {
	if seat >= 0 && seat < MaxSeats {
		t.Seats[seat] = nil
	}
}

// SitDownBot seats an AI player (no wallet debit; not tied to a presence).
func (t *Table) SitDownBot(seat int, userID, username string, buyIn int64) error {
	if err := t.SitDown(seat, userID, username, buyIn); err != nil {
		return err
	}
	t.Seats[seat].IsBot = true
	return nil
}

// MoveSeat relocates an occupant to an empty seat, preserving their exact Seat
// (stack, status) — no buy-in clamp, since these chips are already in play.
// Intended for use only between hands; moving mid-hand would corrupt button and
// action indices.
func (t *Table) MoveSeat(from, to int) error {
	if from < 0 || from >= t.cap() || to < 0 || to >= t.cap() {
		return fmt.Errorf("invalid seat")
	}
	if t.Seats[from] == nil {
		return fmt.Errorf("no player to move")
	}
	if t.Seats[to] != nil {
		return fmt.Errorf("seat taken")
	}
	s := t.Seats[from]
	s.Index = to
	t.Seats[to] = s
	t.Seats[from] = nil
	return nil
}

// FirstEmptySeat returns the lowest empty seat index, or -1 if the table is full.
func (t *Table) FirstEmptySeat() int {
	for i := 0; i < MaxSeats; i++ {
		if t.Seats[i] == nil {
			return i
		}
	}
	return -1
}

func (t *Table) StartHand(sb, bb int64) error {
	// Shuffle FIRST: if engine-math is unreachable, bail before mutating any hand
	// state (HandNo, board, pot) or posting blinds, so a dealer outage leaves the
	// table cleanly between hands rather than half-started.
	deck, commitment, seed, deckOrder, err := NewDeck()
	if err != nil {
		return err
	}
	t.HandNo++
	t.Deck = deck
	t.DeckOrder = deckOrder
	t.DeckCommitment = commitment
	t.DeckSeed = seed
	t.Board = nil
	t.HoleCards = map[string][]Card{}
	t.Pot = 0
	t.CurrentBet = bb
	t.MinRaise = bb
	t.Street = StreetPreflop
	t.ActedThisRound = map[int]bool{}
	t.LastAggressorSeat = -1 // reset show-order tracking each hand

	// Need at least 2 ACTIVE seats (seated with chips, not sitting out, not owing a
	// post) to start a hand. Sitting-out / owing players are held out until they
	// return / post.
	active := t.activeSeats()
	if len(active) < 2 {
		// Too few active players to continue the current game. If enough players are
		// nonetheless present and willing (chips, not sitting out) — e.g. a fresh
		// table where everyone would otherwise "owe" a post — a NEW game forms:
		// clear owed-posts and start blinds fresh. Otherwise wait.
		ready := t.readySeats()
		if len(ready) < 2 {
			t.Street = StreetWaiting
			return nil
		}
		for _, idx := range ready {
			t.Seats[idx].OwesPost = false
			t.Seats[idx].PostNow = false
		}
		t.SBSeat, t.BBSeat = -1, -1 // fresh anchors → first-hand blind assignment
		active = t.activeSeats()
	}

	// Determine the button and blinds up front (forward-moving big blind, honoring
	// dead button + dead small blind) so we know who is in the hand before dealing.
	btn, sbSeat, bbSeat, deadSB := t.assignButtonAndBlinds(active)
	t.ButtonSeat = btn // may point at an emptied seat (dead button) — that's allowed

	occupied := t.seatedIndices()
	in := t.dealtIn(active, bbSeat)

	// Deal hole cards (2 for Hold'em, 4 for PLO) to the IN-HAND seats. Everyone else
	// is HELD OUT: marked folded with no cards, so they're excluded from action, the
	// pot and showdown, and re-evaluated next hand until they post — the "no buying
	// the button" rule. The held-out flags (SittingOut/OwesPost) persist across
	// ResetBetweenHands, so a held-out player stays out until they actually post.
	n := t.holeCount()
	for _, idx := range occupied {
		s := t.Seats[idx]
		s.Bet = 0
		s.LastAction = ""
		if in[idx] {
			hole := make([]Card, n)
			for i := 0; i < n; i++ {
				hole[i] = t.draw()
			}
			t.HoleCards[s.UserID] = hole
			s.Status = SeatSeated
		} else {
			s.Status = SeatFolded
		}
	}

	// Reset per-hand feature state before choosing the opening structure.
	t.StraddleSeat = -1
	t.RunItTwice = false

	// Bomb pot: every IN-HAND player antes, preflop betting is skipped, and the
	// hand deals straight to the flop. Takes precedence over blinds/straddle.
	if t.AllowBombPot && t.BombPotRequested {
		ante := t.bombAnte(bb)
		t.BombPotRequested = false
		if ante > 0 {
			for _, idx := range occupied {
				if in[idx] {
					t.postAnte(idx, ante)
				}
			}
			// Deal the flop immediately; there is no preflop betting round.
			t.Board = append(t.Board, t.draw(), t.draw(), t.draw())
			t.Street = StreetFlop
			t.CurrentBet = 0
			t.MinRaise = bb
			t.ActedThisRound = map[int]bool{}
			// Post-flop action opens on the first active seat left of the button.
			t.ActionSeat = t.nextActiveSeat(t.ButtonSeat)
			t.SBSeat, t.BBSeat = sbSeat, bbSeat
			return nil
		}
	}

	// Post blinds. A DEAD small blind (its seat is empty / sitting out / owing) means
	// no small blind is posted this hand. The big blind is always posted; when the
	// BB seat owes a blind, forcePostBB satisfies that debt with no penalty.
	if !deadSB && sbSeat != bbSeat {
		t.postBlind(sbSeat, sb, "SB")
	}
	t.forcePostBB(bbSeat, bb)

	// Players who elected to post on entry (PostNow) pay a dead SB + a live BB now
	// and are in (already dealt above). The BB seat is handled by forcePostBB above.
	for _, idx := range occupied {
		s := t.Seats[idx]
		if idx != bbSeat && s.Status == SeatSeated && s.OwesPost && s.PostNow {
			t.postReturn(idx, sb, bb)
		}
	}

	t.ActionSeat = t.nextActiveSeat(bbSeat)

	// Persist the blind anchors for next hand's forward-moving big blind.
	t.SBSeat, t.BBSeat = sbSeat, bbSeat

	// Optional voluntary straddle: UTG posts 2x BB and betting reopens from the
	// straddle (the straddler retains the option to act last preflop, exactly as
	// the big blind does — postBlind does not mark the seat as having acted).
	if t.AllowStraddle && t.StraddleRequested {
		utg := t.nextActiveSeat(bbSeat)
		su := t.Seats[utg]
		straddle := 2 * bb
		if utg != bbSeat && utg != sbSeat && su != nil && su.Stack >= straddle {
			t.postBlind(utg, straddle, "STRADDLE")
			t.CurrentBet = straddle
			t.MinRaise = bb // last raise increment stays one big blind
			t.StraddleSeat = utg
			t.ActionSeat = t.nextActiveSeat(utg)
		}
	}
	t.StraddleRequested = false
	return nil
}

// bombAnte is the per-player ante for a bomb pot: the configured amount, or one
// big blind when none is configured.
func (t *Table) bombAnte(bb int64) int64 {
	if t.BombPotAnte > 0 {
		return t.BombPotAnte
	}
	return bb
}

// postAnte moves an ante into the pot. Unlike a blind it does NOT set the seat's
// current Bet (there is nothing to call it against), so bomb-pot flop betting
// opens at CurrentBet 0. A player who cannot cover the ante is put all-in for it.
func (t *Table) postAnte(seat int, amount int64) {
	s := t.Seats[seat]
	if s == nil || amount <= 0 {
		return
	}
	pay := amount
	if pay > s.Stack {
		pay = s.Stack
	}
	s.Stack -= pay
	t.addContribution(seat, pay)
	s.LastAction = "ante"
	if s.Stack == 0 {
		s.Status = SeatAllIn
	}
}

func (t *Table) addContribution(seat int, amount int64) {
	if amount <= 0 {
		return
	}
	t.Pot += amount
	if t.Seats[seat] != nil {
		t.Seats[seat].TotalContributed += amount
	}
}

func (t *Table) postBlind(seat int, amount int64, label string) {
	s := t.Seats[seat]
	if s == nil {
		return
	}
	pay := amount
	if pay > s.Stack {
		pay = s.Stack
	}
	s.Stack -= pay
	s.Bet = pay
	t.addContribution(seat, pay)
	s.LastAction = label
}

func (t *Table) draw() Card {
	c := t.Deck[0]
	t.Deck = t.Deck[1:]
	return c
}

func (t *Table) seatedIndices() []int {
	out := []int{}
	for i, s := range t.Seats {
		if s != nil && s.Status != SeatEmpty {
			out = append(out, i)
		}
	}
	return out
}

func (t *Table) nextSeated(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		if t.Seats[idx] != nil {
			return idx
		}
	}
	return from
}

// active reports whether a seat is eligible to be dealt into a new hand: seated
// with chips, not sitting out, and not owing a post. Blind/button SELECTION uses
// this (and its walkers below); in-hand ACTION order still uses nextActiveSeat.
func (t *Table) active(idx int) bool {
	s := t.Seats[idx]
	return s != nil && s.Status == SeatSeated && s.Stack > 0 && !s.SittingOut && !s.OwesPost
}

// activeSeats returns the ascending indices of all active seats.
func (t *Table) activeSeats() []int {
	out := []int{}
	for i := 0; i < MaxSeats; i++ {
		if t.active(i) {
			out = append(out, i)
		}
	}
	return out
}

// readySeats returns seats that COULD play (seated, chips, not sitting out),
// including those that currently owe a post. Used to detect a newly-forming game
// where every player would otherwise be held out.
func (t *Table) readySeats() []int {
	out := []int{}
	for i := 0; i < MaxSeats; i++ {
		s := t.Seats[i]
		if s != nil && s.Status == SeatSeated && s.Stack > 0 && !s.SittingOut {
			out = append(out, i)
		}
	}
	return out
}

// nextEligible returns the first active seat clockwise from `from`.
func (t *Table) nextEligible(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		if t.active(idx) {
			return idx
		}
	}
	return from
}

// nextBBSeat returns the first seat clockwise from `from` that can POST the big
// blind. Unlike active(), this INCLUDES a seat that owes a post: when the moving
// big blind reaches such a player it is their natural big blind, which forces the
// post and clears the debt with no dead-blind penalty.
func (t *Table) nextBBSeat(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		s := t.Seats[idx]
		if s != nil && s.Stack > 0 && !s.SittingOut {
			return idx
		}
	}
	return from
}

// postsSB reports whether a seat actually posts the small blind (a dead/empty/
// sitting-out/owing seat does not → dead small blind, no SB that hand).
func (t *Table) postsSB(idx int) bool { return t.active(idx) }

// assignButtonAndBlinds derives this hand's button, small-blind and big-blind
// seats using the forward-moving big blind. active is the pre-dealt active set
// (len >= 2). Heads-up is the special case (button posts the small blind); the
// first hand (no anchor yet) mirrors the historical button = first active seat;
// thereafter the blinds are pinned from last hand's anchors so the button can be
// dead (its seat emptied) and the small blind can be dead (its seat can't post).
func (t *Table) assignButtonAndBlinds(active []int) (btn, sbSeat, bbSeat int, deadSB bool) {
	if len(active) == 2 {
		// Heads-up: the button posts the small blind and acts first pre-flop.
		// Alternate the button each hand off the anchor (last BB becomes button/SB).
		if t.BBSeat >= 0 && (t.Seats[t.BBSeat] != nil) {
			btn = t.BBSeat
		} else {
			btn = active[0]
		}
		if !t.active(btn) {
			btn = active[0]
		}
		other := active[0]
		if other == btn {
			other = active[1]
		}
		return btn, btn, other, false
	}
	if t.BBSeat < 0 {
		// First hand: button = first active seat (parity with the historical rule).
		btn = active[0]
		sbSeat = t.nextEligible(btn)
		bbSeat = t.nextEligible(sbSeat)
		return btn, sbSeat, bbSeat, false
	}
	// Moving big blind with a pinned (possibly dead) button and small blind.
	sbSeat = t.BBSeat            // last hand's BB seat; may be empty/sitting-out/owing → dead SB
	btn = t.SBSeat              // last hand's SB seat; may be empty → dead button
	bbSeat = t.nextBBSeat(t.BBSeat) // advance exactly one live seat
	deadSB = !t.postsSB(sbSeat)
	return btn, sbSeat, bbSeat, deadSB
}

// dealtIn returns the set of seats that are IN this hand: the active players, the
// big blind (whose forced post covers any owed blind), and anyone who elected to
// post on entry. Everyone else is held out (dealt no cards).
func (t *Table) dealtIn(active []int, bbSeat int) map[int]bool {
	in := map[int]bool{}
	for _, idx := range active {
		in[idx] = true
	}
	in[bbSeat] = true
	for i := 0; i < MaxSeats; i++ {
		s := t.Seats[i]
		if s != nil && s.OwesPost && s.PostNow && s.Stack > 0 && !s.SittingOut {
			in[i] = true
		}
	}
	return in
}

// forcePostBB posts the big blind and clears any owed-post / sitting-out flags:
// the natural big blind satisfies the blind obligation with no dead-blind penalty.
func (t *Table) forcePostBB(seat int, bb int64) {
	s := t.Seats[seat]
	if s == nil {
		return
	}
	s.OwesPost = false
	s.SittingOut = false
	t.postBlind(seat, bb, "BB")
}

// postReturn is the entry posting for a player who elected to post immediately: a
// dead small blind forfeited to the pot (no live Bet) plus a live big blind, after
// which they are in and their owed-post is cleared.
func (t *Table) postReturn(seat int, sb, bb int64) {
	s := t.Seats[seat]
	if s == nil {
		return
	}
	t.postAnte(seat, sb) // dead SB → pot, sets no Bet (same mechanic as an ante)
	t.postBlind(seat, bb, "BB")
	s.OwesPost = false
	s.PostNow = false
	s.SittingOut = false
}

func (t *Table) nextActiveSeat(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		s := t.Seats[idx]
		if s != nil && s.Status == SeatSeated && s.Stack > 0 {
			return idx
		}
	}
	return -1
}

// FirstToShowSeat returns the seat that must show first at showdown: the last
// aggressor on the final betting round, or — when the hand was checked down —
// the first active seat to the left of the button. Returns -1 if none.
func (t *Table) FirstToShowSeat() int {
	if t.LastAggressorSeat >= 0 {
		return t.LastAggressorSeat
	}
	return t.nextActiveSeat(t.ButtonSeat)
}

func (t *Table) activeCount() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && (s.Status == SeatSeated || s.Status == SeatAllIn) {
			n++
		}
	}
	return n
}

func (t *Table) ApplyAction(seat int, action string, amount int64) error {
	s := t.Seats[seat]
	if s == nil || seat != t.ActionSeat {
		return fmt.Errorf("not your turn")
	}
	toCall := t.CurrentBet - s.Bet
	switch action {
	case "fold":
		s.Status = SeatFolded
		s.LastAction = "fold"
	case "check":
		if toCall > 0 {
			return fmt.Errorf("cannot check")
		}
		s.LastAction = "check"
	case "call":
		pay := toCall
		if pay > s.Stack {
			pay = s.Stack
		}
		s.Stack -= pay
		s.Bet += pay
		t.addContribution(seat, pay)
		s.LastAction = "call"
		if s.Stack == 0 {
			s.Status = SeatAllIn
		}
	case "raise", "all_in":
		if action == "all_in" {
			amount = s.Bet + s.Stack
		}
		// Pot-limit: no bet may exceed the pot. A shove above the cap becomes a
		// pot-sized raise; an explicit raise above the cap is rejected.
		if t.PotLimit {
			maxTotal := t.potLimitMaxTotal(s, toCall)
			if amount > maxTotal {
				if action == "all_in" {
					amount = maxTotal
				} else {
					return fmt.Errorf("raise exceeds pot limit")
				}
			}
		}
		raiseTotal := amount - s.Bet
		if raiseTotal <= toCall {
			return fmt.Errorf("raise too small")
		}
		if amount > s.Bet+s.Stack {
			amount = s.Bet + s.Stack
		}
		isAllIn := amount == s.Bet+s.Stack
		// Legal minimum raise-TO: the current bet plus the last full-raise
		// increment (at least one big blind). A raise below this is illegal —
		// EXCEPT an all-in shove for less, which is always allowed.
		minRaiseTo := t.CurrentBet + t.MinRaise
		if bb := t.BigBlindAmount(); minRaiseTo < bb {
			minRaiseTo = bb
		}
		if amount < minRaiseTo && !isAllIn {
			return fmt.Errorf("raise below minimum (min %d)", minRaiseTo)
		}
		// A "full raise" (increment ≥ the last full-raise size) RE-OPENS the
		// betting for players who already acted. A short all-in that doesn't
		// complete a full raise does NOT re-open action — prior actors may only
		// call or fold, and the minimum-raise size is unchanged.
		fullRaise := amount-t.CurrentBet >= t.MinRaise

		add := amount - s.Bet
		s.Stack -= add
		s.Bet = amount
		t.addContribution(seat, add)
		if amount > t.CurrentBet {
			if fullRaise {
				t.MinRaise = amount - t.CurrentBet
			}
			t.CurrentBet = amount
			t.LastAggressorSeat = seat // last aggressor — shows first at showdown
		}
		s.LastAction = action
		if s.Stack == 0 {
			s.Status = SeatAllIn
		}
		if fullRaise {
			t.ActedThisRound = map[int]bool{seat: true} // re-open action
		} else {
			t.ActedThisRound[seat] = true // short all-in: does not re-open
		}
	default:
		return fmt.Errorf("unknown action")
	}
	t.ActedThisRound[seat] = true
	return nil
}

func (t *Table) AdvanceAction() bool {
	next := t.nextActiveSeat(t.ActionSeat)
	if next < 0 {
		return t.advanceStreet()
	}
	if t.allMatched() {
		return t.advanceStreet()
	}
	t.ActionSeat = next
	return false
}

func (t *Table) allMatched() bool {
	for _, s := range t.Seats {
		if s == nil || s.Status == SeatFolded {
			continue
		}
		if s.Status == SeatSeated && s.Bet < t.CurrentBet && s.Stack > 0 {
			return false
		}
		// A seated player with no chips cannot act, so nextActiveSeat never gives
		// them a turn — requiring them to have "acted" here would deadlock the
		// round forever (e.g. a busted-but-still-seated bot on a cash table).
		if !t.ActedThisRound[s.Index] && s.Status == SeatSeated && s.Stack > 0 {
			return false
		}
	}
	return true
}

func (t *Table) advanceStreet() bool {
	// Reset bets for new street
	for _, s := range t.Seats {
		if s != nil {
			s.Bet = 0
		}
	}
	t.CurrentBet = 0
	t.MinRaise = 0
	t.ActedThisRound = map[int]bool{}

	switch t.Street {
	case StreetPreflop:
		t.Board = append(t.Board, t.draw(), t.draw(), t.draw())
		t.Street = StreetFlop
	case StreetFlop:
		t.Board = append(t.Board, t.draw())
		t.Street = StreetTurn
	case StreetTurn:
		t.Board = append(t.Board, t.draw())
		t.Street = StreetRiver
	case StreetRiver:
		t.Street = StreetShowdown
		return true
	default:
		return true
	}
	if t.onlyAllInRemaining() {
		return t.advanceStreet()
	}
	t.ActionSeat = t.nextActiveSeat(t.ButtonSeat)
	if t.ActionSeat < 0 {
		return t.advanceStreet()
	}
	return false
}

func (t *Table) onlyAllInRemaining() bool {
	canAct := 0
	for _, s := range t.Seats {
		if s == nil || s.Status == SeatFolded {
			continue
		}
		if s.Status == SeatSeated && s.Stack > 0 {
			canAct++
		}
	}
	return canAct <= 1
}

func (t *Table) ValidActions(seat int) (actions []string, toCall, minRaise, maxRaise int64) {
	s := t.Seats[seat]
	if s == nil {
		return nil, 0, 0, 0
	}
	toCall = t.CurrentBet - s.Bet
	if toCall < 0 {
		toCall = 0
	}
	maxRaise = s.Bet + s.Stack
	// Pot-limit caps the max raise to the pot size (still clamped by stack).
	if t.PotLimit {
		if capTotal := t.potLimitMaxTotal(s, toCall); capTotal < maxRaise {
			maxRaise = capTotal
		}
	}
	minRaise = t.CurrentBet + t.MinRaise
	if minRaise < t.BigBlindAmount() {
		minRaise = t.BigBlindAmount()
	}
	actions = append(actions, "fold")
	if toCall == 0 {
		actions = append(actions, "check")
	} else {
		actions = append(actions, "call")
	}
	if s.Stack > toCall {
		actions = append(actions, "raise", "all_in")
	}
	return actions, toCall, minRaise, maxRaise
}

func (t *Table) BigBlindAmount() int64 {
	if t.MinRaise > 0 {
		return t.MinRaise
	}
	return 200
}

func (t *Table) ResetBetweenHands() {
	t.Street = StreetWaiting
	t.Board = nil
	t.Pot = 0
	t.CurrentBet = 0
	for _, s := range t.Seats {
		if s != nil {
			s.Bet = 0
			s.TotalContributed = 0
			s.Status = SeatSeated
			s.LastAction = ""
		}
	}
}

func (t *Table) NonFoldedSeats() []int {
	out := []int{}
	for i, s := range t.Seats {
		if s != nil && s.Status != SeatFolded && s.Status != SeatEmpty {
			out = append(out, i)
		}
	}
	return out
}

func (t *Table) UncontestedWinner() (int, bool) {
	active := t.NonFoldedSeats()
	if len(active) == 1 {
		return active[0], true
	}
	return -1, false
}

func (t *Table) ResolveAndAward() ([][]int, error) {
	winners, _, err := AwardSidePots(t)
	return winners, err
}
