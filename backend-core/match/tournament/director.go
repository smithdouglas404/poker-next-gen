package tournament

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
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
	if level.IsBreak {
		return
	}
	elapsed := time.Since(s.LevelStart).Seconds()
	if elapsed < float64(level.DurationSecs) {
		remaining := int(float64(level.DurationSecs) - elapsed)
		broadcastInfo(dispatcher, s, remaining, level)
		return
	}
	if s.CurrentLevel < len(s.BlindLevels) {
		s.CurrentLevel++
		s.LevelStart = time.Now().UTC()
		_ = store.NewTournamentStore(db).AdvanceLevel(ctx, s.TournamentID, s.CurrentLevel)
		level = s.BlindLevels[s.CurrentLevel-1]
		signalBlinds(ctx, nk, s, level)
		broadcastInfo(dispatcher, s, int(level.DurationSecs), level)
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
	})
	_ = dispatcher.BroadcastMessage(protocol.OpTournamentInfo, payload, nil, nil, true)
}

func (h *Handler) checkFinish(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, s *DirectorState) {
	tStore := store.NewTournamentStore(db)
	playing, err := tStore.CountPlaying(ctx, s.TournamentID)
	if err != nil || playing > 1 {
		return
	}
	players, _ := tStore.ListRegistered(ctx, s.TournamentID)
	for _, p := range players {
		if p.Status == "playing" {
			prizes, _ := tStore.ListPrizes(ctx, s.TournamentID)
			if len(prizes) > 0 {
				pool := int64(playing) * 10000 // simplified; real pool from buy-ins
				_ = tStore.PayWinner(ctx, s.TournamentID, p.UserID, pool*int64(prizes[0].PayoutBps)/10000)
			}
		}
	}
	_ = tStore.Finish(ctx, s.TournamentID)
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
			h.rebalance(ctx, db, nk, s)
		}
	}
	return s, ""
}

func (h *Handler) rebalance(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *DirectorState) {
	tStore := store.NewTournamentStore(db)
	rule, _ := tStore.GetBalancingRule(ctx, s.TournamentID)
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
	minIdx := 0
	for i, c := range counts {
		if c.count < minC {
			minC, minIdx = c.count, i
		}
		if c.count > maxC {
			maxC = c.count
		}
	}
	if maxC-minC <= int(rule.MaxSeatDifference) {
		return
	}
	// Break table if at or below threshold
	for i, c := range counts {
		if c.count <= int(rule.BreakTableAtOrBelow) && len(tables) > 1 {
			payload, _ := json.Marshal(map[string]interface{}{"type": "balance_table"})
			_, _ = nk.MatchSignal(ctx, c.matchID, string(payload))
			_ = mergeTable(ctx, db, nk, s, c.matchID, counts[minIdx].matchID)
			tables = append(tables[:i], tables[i+1:]...)
			s.TableMatches = tables
			break
		}
	}
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

func mergeTable(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *DirectorState, fromMatch, toMatch string) error {
	rows, err := db.QueryContext(ctx, `
		SELECT user_id FROM poker_tournament_registration
		WHERE tournament_id=$1 AND match_id=$2 AND status='playing'`, s.TournamentID, fromMatch)
	if err != nil {
		return err
	}
	defer rows.Close()
	tStore := store.NewTournamentStore(db)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		_ = tStore.AssignPlayerTable(ctx, s.TournamentID, userID, toMatch)
	}
	return nil
}

// StartTournament creates table matches and the director match for a tournament.
func StartTournament(ctx context.Context, nk runtime.NakamaModule, db *sql.DB, tournamentID string) (string, []string, error) {
	tStore := store.NewTournamentStore(db)
	players, err := tStore.ListRegistered(ctx, tournamentID)
	if err != nil {
		return "", nil, err
	}
	if len(players) < 2 {
		return "", nil, runtime.NewError("need at least 2 registered players", 3)
	}
	tournaments, _ := tStore.List(ctx)
	var startingStack int64 = 10000
	for _, t := range tournaments {
		if t.ID == tournamentID {
			startingStack = t.StartingStack
			break
		}
	}
	tableCount := int(math.Max(1, math.Ceil(float64(len(players))/float64(protocol.MaxSeats))))
	var tableMatches []string
	for i := 0; i < tableCount; i++ {
		matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
			"room_id":       fmt.Sprintf("%s-table-%d", tournamentID, i+1),
			"tournament_id": tournamentID,
			"small_blind":   float64(50),
			"big_blind":     float64(100),
			"buy_in":        float64(startingStack),
		})
		if err != nil {
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
		return "", nil, err
	}
	_ = tStore.SetDirectorMatch(ctx, tournamentID, directorID)
	return directorID, tableMatches, nil
}
