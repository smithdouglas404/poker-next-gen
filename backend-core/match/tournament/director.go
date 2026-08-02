package tournament

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/social"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

type DirectorState struct {
	TournamentID string
	TableMatches []string
	BlindLevels  []models.BlindTimer
	CurrentLevel int
	LevelStart   time.Time
	Tick         int64
}

type Handler struct{}

func (h *Handler) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	tournamentID, _ := params["tournament_id"].(string)
	state := &DirectorState{TournamentID: tournamentID, CurrentLevel: 1, LevelStart: time.Now().UTC()}
	if raw, ok := params["table_matches"].([]interface{}); ok {
		for _, v := range raw {
			if s, ok := v.(string); ok {
				state.TableMatches = append(state.TableMatches, s)
			}
		}
	}
	if len(state.TableMatches) == 0 {
		state.TableMatches, _ = store.NewTournamentStore(db).ListTableMatches(ctx, tournamentID)
	}
	levels, _ := store.NewTournamentStore(db).ListBlinds(ctx, tournamentID)
	if len(levels) > 0 {
		state.BlindLevels = levels
	} else {
		state.BlindLevels = []models.BlindTimer{{Level: 1, SmallBlind: 50, BigBlind: 100, DurationSecs: 600}}
	}
	if state.BlindLevels[0].IsBreak {
		// An operator-configured schedule that opens on a break: tables must
		// start with dealing paused rather than only finding out once tickClock
		// advances past level 1 (which, for a first-level break, never happens
		// on its own — nothing else sends this signal at t=0).
		signalBreak(ctx, nk, state, true)
	}
	label, _ := json.Marshal(map[string]interface{}{"module": protocol.TournamentModule, "tournament_id": tournamentID})
	return state, 10, string(label)
}

func (h *Handler) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	return state, true, ""
}

func (h *Handler) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	return state
}

func (h *Handler) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	return state
}

func (h *Handler) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*DirectorState)
	s.Tick = tick

	// ~10 ticks/sec from MatchInit rate
	if tick%10 == 0 {
		h.tickClock(ctx, logger, db, nk, dispatcher, s)
		h.checkFinish(ctx, logger, db, nk, dispatcher, s)
		pruneEmptyTables(ctx, db, s)
	}
	return s
}

func (h *Handler) tickClock(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, s *DirectorState) {
	if len(s.BlindLevels) == 0 {
		return
	}
	idx := s.CurrentLevel - 1
	if idx < 0 || idx >= len(s.BlindLevels) {
		return
	}
	level := s.BlindLevels[idx]
	// A break level still has to count down and advance on its own timer — the
	// old `if level.IsBreak { return }` here made tickClock a permanent no-op
	// for the rest of the tournament once a break level was reached, since
	// elapsed time was never checked and CurrentLevel never moved past it.
	elapsed := time.Since(s.LevelStart).Seconds()
	if elapsed < float64(level.DurationSecs) {
		remaining := int(float64(level.DurationSecs) - elapsed)
		broadcastInfo(dispatcher, s, remaining, level)
		return
	}
	if s.CurrentLevel < len(s.BlindLevels) {
		wasBreak := level.IsBreak
		s.CurrentLevel++
		s.LevelStart = time.Now().UTC()
		_ = store.NewTournamentStore(db).AdvanceLevel(ctx, s.TournamentID, s.CurrentLevel)
		level = s.BlindLevels[s.CurrentLevel-1]
		if level.IsBreak {
			// A break level has no blinds to push to the tables — signal the
			// dealing pause instead of signalBlinds.
			signalBreak(ctx, nk, s, true)
		} else {
			if wasBreak {
				signalBreak(ctx, nk, s, false)
			}
			signalBlinds(ctx, nk, s, level)
		}
		broadcastInfo(dispatcher, s, int(level.DurationSecs), level)
	}
}

// signalBreak tells every table in the tournament to start or stop honoring a
// scheduled break. Without this, entering an IsBreak blind level was purely
// cosmetic on the info broadcast — tables kept dealing hands straight through
// the break with only a countdown label to say otherwise.
func signalBreak(ctx context.Context, nk runtime.NakamaModule, s *DirectorState, start bool) {
	msgType := "tournament_break_end"
	if start {
		msgType = "tournament_break_start"
	}
	payload, _ := json.Marshal(map[string]interface{}{"type": msgType})
	for _, matchID := range s.TableMatches {
		_, _ = nk.MatchSignal(ctx, matchID, string(payload))
	}
}

func signalBlinds(ctx context.Context, nk runtime.NakamaModule, s *DirectorState, level models.BlindTimer) {
	payload, _ := json.Marshal(map[string]interface{}{
		"type":        "blind_update",
		"level":       level.Level,
		"small_blind": level.SmallBlind,
		"big_blind":   level.BigBlind,
		"ante":        level.Ante,
	})
	for _, matchID := range s.TableMatches {
		_, _ = nk.MatchSignal(ctx, matchID, string(payload))
	}
}

func broadcastInfo(dispatcher runtime.MatchDispatcher, s *DirectorState, secondsRemaining int, level models.BlindTimer) {
	payload, _ := json.Marshal(map[string]interface{}{
		"tournament_id":       s.TournamentID,
		"level":               level.Level,
		"small_blind":         level.SmallBlind,
		"big_blind":           level.BigBlind,
		"ante":                level.Ante,
		"seconds_remaining":   secondsRemaining,
		"is_break":            level.IsBreak,
	})
	_ = dispatcher.BroadcastMessage(protocol.OpTournamentInfo, payload, nil, nil, true)
}

func (h *Handler) checkFinish(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, s *DirectorState) {
	tStore := store.NewTournamentStore(db)
	playing, err := tStore.CountPlaying(ctx, s.TournamentID)
	if err != nil || playing > 1 {
		return
	}
	// checkFinish runs on every tick while one player remains — without this
	// claim it would rebuild the finisher list and re-run the ENTIRE payout
	// loop on every subsequent tick until the match actually stops calling it,
	// crediting every winner's prize repeatedly. It also races the admin
	// tournament_finalize RPC, which pays the identical prize ladder. Only the
	// caller that wins this claim may pay anyone; FinishOnce is the same gate
	// tournament_finalize uses, so at most one of the two ever pays out.
	claimed, cerr := tStore.FinishOnce(ctx, s.TournamentID)
	if cerr != nil || !claimed {
		return
	}
	// The last player still 'playing' is the champion — finish place 1.
	players, _ := tStore.ListRegistered(ctx, s.TournamentID)
	for _, p := range players {
		if p.Status == "playing" {
			// ListFinishers (below) is what the payout loop reads; a champion
			// who never got finish_place=1 recorded is invisible to it, and
			// FinishOnce above means nothing will retry this.
			if serr := tStore.SetFinishPlace(ctx, s.TournamentID, p.UserID, 1); serr != nil {
				logger.Error("champion finish place not recorded tournament=%s user=%s: %v",
					s.TournamentID, p.UserID, serr)
			}
		}
	}

	// Prize pool comes from store.TournamentMoney — the same function the
	// analytics snapshot and tournament_finalize use, so what the operator was
	// shown before the event is what the winners are actually paid. This was
	// `entrants × buy_in` computed inline, which paid out the club's entry fee
	// as prize money while the reports counted it as club revenue.
	entrants, _ := tStore.CountEntrants(ctx, s.TournamentID)
	bracket, _ := tStore.Get(ctx, s.TournamentID)
	pool := store.TournamentMoney(bracket, entrants).PoolMinor

	// Pay the full prize ladder: each tier's basis-point share is split evenly
	// across the finishing positions it covers.
	prizes, _ := tStore.ListPrizes(ctx, s.TournamentID)
	finishers, _ := tStore.ListFinishers(ctx, s.TournamentID)
	// Last line of defence against overlapping prize tiers paying one finisher
	// twice. TournamentStart now rejects an overlapping ladder outright, but
	// tournaments configured before that validation existed can still hold one,
	// and this loop is where the money actually moves.
	paid := map[string]bool{}
	for _, prize := range prizes {
		places := int(prize.RankTo - prize.RankFrom + 1)
		if places <= 0 {
			places = 1
		}
		perPlace := pool * int64(prize.PayoutBps) / 10000 / int64(places)
		if perPlace <= 0 {
			continue
		}
		for _, f := range finishers {
			if f.FinishPlace < int(prize.RankFrom) || f.FinishPlace > int(prize.RankTo) {
				continue
			}
			if paid[f.UserID] {
				logger.Error("OVERLAPPING PRIZE TIERS tournament=%s user=%s place=%d — already paid, skipping a second payout",
					s.TournamentID, f.UserID, f.FinishPlace)
				continue
			}
			paid[f.UserID] = true
			// FinishOnce already claimed and committed 'finished' above, by
			// design, so nothing will ever retry this payout for this
			// tournament — a failure here has no other chance to be corrected.
			if perr := tStore.PayWinner(ctx, s.TournamentID, f.UserID, perPlace); perr != nil {
				logger.Error("TOURNAMENT PAYOUT FAILED tournament=%s user=%s place=%d amount_cents=%d: %v",
					s.TournamentID, f.UserID, f.FinishPlace, perPlace, perr)
			} else if aerr := audit.EmitLedger(ctx, audit.NewPostgresEmitter(db), "tournament_prize_paid", bracket.ClubID, map[string]any{
				"tournament_id": s.TournamentID,
				"user_id":       f.UserID,
				"finish_place":  f.FinishPlace,
				"amount_cents":  perPlace,
			}); aerr != nil {
				logger.Warn("tournament prize audit anchor failed: %v", aerr)
			}
			subject, code := "tournament_cashed", social.CodeTournamentInfo
			if f.FinishPlace == 1 {
				subject, code = "tournament_won", social.CodeTournamentWon
			}
			social.Notify(ctx, nk, f.UserID, subject, map[string]interface{}{
				"tournament_id": s.TournamentID,
				"place":         f.FinishPlace,
				"amount":        perPlace,
			}, code)
		}
	}

	// Status is already 'finished' — FinishOnce claimed it before any payout ran.
	payload, _ := json.Marshal(map[string]interface{}{"tournament_id": s.TournamentID, "status": "finished"})
	_ = dispatcher.BroadcastMessage(protocol.OpTournamentInfo, payload, nil, nil, true)
}

func (h *Handler) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (h *Handler) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	s := state.(*DirectorState)
	var msg map[string]interface{}
	if json.Unmarshal([]byte(data), &msg) == nil {
		if msg["type"] == "balance" {
			h.rebalance(ctx, logger, db, nk, s)
		}
	}
	return s, ""
}

func (h *Handler) rebalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, s *DirectorState) {
	tStore := store.NewTournamentStore(db)
	rule, err := tStore.GetBalancingRule(ctx, s.TournamentID)
	if err != nil || rule == nil {
		// GetBalancingRule only returns (nil, nil) on ErrNoRows via its own
		// defaulted-struct fallback, so a nil rule here means a real query
		// error that the old `rule, _ := ...` discarded — the two int(rule....)
		// reads a few lines below would nil-pointer-panic on it.
		logger.Error("rebalance: GetBalancingRule tournament=%s: %v", s.TournamentID, err)
		return
	}
	tables := s.TableMatches
	if len(tables) < 2 {
		return
	}
	type tableCount struct {
		matchID string
		count   int
	}
	var counts []tableCount
	for _, m := range tables {
		n, _ := countAtTable(ctx, db, s.TournamentID, m)
		counts = append(counts, tableCount{matchID: m, count: n})
	}
	minC, maxC := counts[0].count, counts[0].count
	for _, c := range counts {
		if c.count < minC {
			minC = c.count
		}
		if c.count > maxC {
			maxC = c.count
		}
	}
	if maxC-minC <= int(rule.MaxSeatDifference) {
		return
	}
	// Break the first table at or below threshold, merging it into whichever
	// OTHER table currently has the fewest players. The target search excludes
	// the table being broken — the old code picked a single global minIdx
	// before knowing which table would break, so whenever the smallest table
	// overall was also the one selected to break (the common case: that IS why
	// it's the one being broken), mergeTable ran with fromMatch == toMatch.
	//
	// mergeTable only QUEUES each player's live seat transfer — see
	// match/holdem/handler.go's "tournament_seat_out"/"tournament_seat_in"
	// signals and processPendingSeatTransfers — the broken table isn't spliced
	// out of s.TableMatches here, because the transfers it just queued haven't
	// necessarily happened yet (a live hand in progress defers them to that
	// table's next between-hands safe point). Removing it immediately would
	// reopen the exact bug this replaced: a table with still-live players
	// silently cut off from every future blind update because the director
	// stopped tracking it. pruneEmptyTables (called every tick alongside
	// tickClock/checkFinish) removes it once its transfers have actually
	// completed and it is confirmed to hold zero players.
	seatCounts := make([]int, len(counts))
	for i, c := range counts {
		seatCounts[i] = c.count
	}
	for i, c := range counts {
		if c.count > int(rule.BreakTableAtOrBelow) {
			continue
		}
		targetIdx := pickMergeTarget(seatCounts, i)
		if targetIdx == -1 {
			break // no other table exists to receive these players
		}
		_ = mergeTable(ctx, db, nk, s, c.matchID, counts[targetIdx].matchID)
		break
	}
}

// pruneEmptyTables drops any table from s.TableMatches that has been
// confirmed to hold zero 'playing' registrations — the safe, delayed
// counterpart to rebalance() queuing a break: only once every transferred
// player has actually left (per the DB, updated by processPendingSeatTransfers
// only after a destination table confirms it seated them) does the director
// stop sending that table blind updates and break signals.
func pruneEmptyTables(ctx context.Context, db *sql.DB, s *DirectorState) {
	var kept []string
	for _, m := range s.TableMatches {
		if n, _ := countAtTable(ctx, db, s.TournamentID, m); n > 0 {
			kept = append(kept, m)
		}
	}
	s.TableMatches = kept
}

// pickMergeTarget returns the index of the table with the fewest players,
// excluding `skip` (the table being broken) — never merging a table into
// itself. Returns -1 if skip is the only table (nothing to merge into).
func pickMergeTarget(seatCounts []int, skip int) int {
	targetIdx := -1
	for j, n := range seatCounts {
		if j == skip {
			continue
		}
		if targetIdx == -1 || n < seatCounts[targetIdx] {
			targetIdx = j
		}
	}
	return targetIdx
}

func countAtTable(ctx context.Context, db *sql.DB, tournamentID, matchID string) (int, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT COUNT(*) FROM poker_tournament_registration
		WHERE tournament_id=$1 AND match_id=$2 AND status='playing'`, tournamentID, matchID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var n int
	if rows.Next() {
		_ = rows.Scan(&n)
	}
	return n, nil
}

// mergeTable queues a live seat transfer, on fromMatch itself, for every
// player currently 'playing' there — see match/holdem/handler.go's
// MatchSignal case "tournament_seat_out" and processPendingSeatTransfers.
// It deliberately does NOT touch poker_tournament_registration.match_id: that
// column is only updated once fromMatch confirms toMatch actually seated the
// player (via the "tournament_seat_in" response), which happens over on
// fromMatch's own next between-hands safe point, not synchronously here. This
// function only ever requests the move.
func mergeTable(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *DirectorState, fromMatch, toMatch string) error {
	rows, err := db.QueryContext(ctx, `
		SELECT user_id FROM poker_tournament_registration
		WHERE tournament_id=$1 AND match_id=$2 AND status='playing'`, s.TournamentID, fromMatch)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		payload, _ := json.Marshal(map[string]interface{}{
			"type":          "tournament_seat_out",
			"user_id":       userID,
			"dest_match_id": toMatch,
		})
		_, _ = nk.MatchSignal(ctx, fromMatch, string(payload))
	}
	return nil
}

// StartTournament creates table matches and the director match for a tournament.
func StartTournament(ctx context.Context, nk runtime.NakamaModule, db *sql.DB, tournamentID string) (string, []string, error) {
	tStore := store.NewTournamentStore(db)
	// Claim the right to start BEFORE doing anything observable. Without this,
	// a second call (double-click, two configurers, or a call against an
	// already-running/finished event) would build a whole second set of tables
	// and reseat live players onto them. A plain status read in the RPC would
	// still race; this is a compare-and-set.
	claimed, cerr := tStore.ClaimForStart(ctx, tournamentID)
	if cerr != nil {
		return "", nil, cerr
	}
	if !claimed {
		return "", nil, runtime.NewError("tournament is not accepting a start (already running, finished, or being started)", 9)
	}
	// From here on, any early return must release the claim — otherwise a
	// transient failure strands the event in 'starting' where nobody can start it.
	release := func() {
		if rerr := tStore.ReleaseStartClaim(ctx, tournamentID); rerr != nil {
			_ = rerr // best-effort; the tournament stays claimed and needs an admin
		}
	}

	players, err := tStore.ListRegistered(ctx, tournamentID)
	if err != nil {
		release()
		return "", nil, err
	}
	if len(players) < 2 {
		release()
		return "", nil, runtime.NewError("need at least 2 registered players", 3)
	}
	bracket, _ := tStore.Get(ctx, tournamentID)
	var startingStack int64 = 10000
	var timeBankSecs, timeBankPerHand int32
	var autoAway bool
	var seatsPerTable = protocol.MaxSeats
	if bracket != nil {
		if bracket.StartingStack > 0 {
			startingStack = bracket.StartingStack
		}
		timeBankSecs, timeBankPerHand = bracket.TimeBankSecs, bracket.TimeBankPerHandSecs
		autoAway = bracket.AutoAwayOnTimeout
		if bracket.MaxSeatsPerTable >= 2 && int(bracket.MaxSeatsPerTable) < seatsPerTable {
			seatsPerTable = int(bracket.MaxSeatsPerTable)
		}
	}
	tableCount := int(math.Max(1, math.Ceil(float64(len(players))/float64(seatsPerTable))))
	var tableMatches []string
	for i := 0; i < tableCount; i++ {
		// The tournament's own shot-clock / seating config is passed to every
		// table it starts. time_bank_secs and max_seats_per_table were stored on
		// the tournament and never reached the tables, so the configured values
		// had no effect on play.
		matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
			"room_id":              fmt.Sprintf("%s-table-%d", tournamentID, i+1),
			"tournament_id":        tournamentID,
			"small_blind":          float64(50),
			"big_blind":            float64(100),
			"buy_in":               float64(startingStack),
			"max_seats":            float64(seatsPerTable),
			"time_bank_secs":       float64(timeBankSecs),
			"time_bank_per_hand":   float64(timeBankPerHand),
			"auto_away_on_timeout": autoAway,
		})
		if err != nil {
			// Tables already created are left registered against the tournament
			// rather than silently orphaned; releasing the claim lets an operator
			// retry, and the partial set is visible to them.
			release()
			return "", nil, err
		}
		tableMatches = append(tableMatches, matchID)
		_ = tStore.AddTableMatch(ctx, tournamentID, matchID)
	}
	for i, p := range players {
		tableIdx := i % tableCount
		_ = tStore.AssignPlayerTable(ctx, tournamentID, p.UserID, tableMatches[tableIdx])
	}
	directorID, err := nk.MatchCreate(ctx, protocol.TournamentModule, map[string]interface{}{
		"tournament_id": tournamentID,
		"table_matches": tableMatches,
	})
	if err != nil {
		release()
		return "", nil, err
	}
	// 'starting' → 'running'. Guarded on the claim we hold, so a caller that
	// never won ClaimForStart can't install its director match over the real one.
	if serr := tStore.SetDirectorMatch(ctx, tournamentID, directorID); serr != nil {
		return "", nil, serr
	}
	return directorID, tableMatches, nil
}
