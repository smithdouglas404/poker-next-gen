package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// cfrHTTPClient allows the multi-second latency of a real CFR solve, unlike the
// shared 2s httpClient used for fast equity/rank calls.
var cfrHTTPClient = &http.Client{Timeout: 20 * time.Second}

type GtoAdvice struct {
	SuggestedAction string  `json:"suggested_action"`
	HeroEquity      float64 `json:"hero_equity"`
	PotOdds         float64 `json:"pot_odds"`
	EVCall          float64 `json:"ev_call"`
	Engine          string  `json:"engine"`
	Note            string  `json:"note"`
	Rationale       string  `json:"rationale"`
}

// CfrAdvice is a genuine CFR (counterfactual regret minimization) solve result
// from engine-math's rs_poker arena solver — not the equity heuristic.
type CfrAdvice struct {
	SuggestedAction string  `json:"suggested_action"`
	Amount          float64 `json:"amount"`
	HeroEquity      float64 `json:"hero_equity"`
	NodesExplored   int     `json:"nodes_explored"`
	Iterations      int     `json:"iterations"`
	DeadlineMs      int     `json:"deadline_ms"`
	Converged       bool    `json:"converged"`
	Engine          string  `json:"engine"`
	Solver          string  `json:"solver"`
	Note            string  `json:"note"`
}

// CfrSolve runs the real rs_poker CFR solver for a heads-up spot via engine-math.
// villainHole is the single opponent hand (heads-up). deadlineMs and iterations
// bound the solve; a longer timeout is used because a genuine solve takes
// seconds, unlike the equity heuristic.
func CfrSolve(heroHole, villainHole, board string, heroStack, villainStack, pot, toCall float64, deadlineMs, iterations int) (CfrAdvice, error) {
	body, _ := json.Marshal(map[string]any{
		"hero_hole":     heroHole,
		"villain_hole":  villainHole,
		"board":         board,
		"hero_stack":    heroStack,
		"villain_stack": villainStack,
		"pot":           pot,
		"to_call":       toCall,
		"deadline_ms":   deadlineMs,
		"iterations":    iterations,
	})
	resp, err := cfrHTTPClient.Post(baseURL()+"/gto/solve", "application/json", bytes.NewReader(body))
	if err != nil {
		return CfrAdvice{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return CfrAdvice{}, fmt.Errorf("engine-math gto solve: %s", string(data))
	}
	var out CfrAdvice
	if err := json.Unmarshal(data, &out); err != nil {
		return CfrAdvice{}, err
	}
	return out, nil
}

// GtoAdvise returns equity-based GTO approximation from engine-math.
func GtoAdvise(heroHole string, villainHoles []string, board string, pot, toCall float64, iterations int) (GtoAdvice, error) {
	body, _ := json.Marshal(map[string]any{
		"hero_hole":      heroHole,
		"villain_holes":  villainHoles,
		"board":          board,
		"pot":            pot,
		"to_call":        toCall,
		"iterations":     iterations,
	})
	resp, err := httpClient.Post(baseURL()+"/gto/advise", "application/json", bytes.NewReader(body))
	if err != nil {
		return GtoAdvice{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return GtoAdvice{}, fmt.Errorf("engine-math gto advise: %s", string(data))
	}
	var out GtoAdvice
	if err := json.Unmarshal(data, &out); err != nil {
		return GtoAdvice{}, err
	}
	return out, nil
}
