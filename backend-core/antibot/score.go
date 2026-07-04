package antibot

import (
	"encoding/json"
	"math"
)

type ActionRecord struct {
	UserID   string  `json:"user_id"`
	Action   string  `json:"action"`
	Amount   int64   `json:"amount"`
	PotRatio float64 `json:"pot_ratio"`
	Street   string  `json:"street"`
}

type ScoreRequest struct {
	UserID  string         `json:"user_id"`
	Actions []ActionRecord `json:"actions"`
}

type ScoreResponse struct {
	UserID     string   `json:"user_id"`
	Score      float64  `json:"score"`
	Risk       string   `json:"risk"`
	Flags      []string `json:"flags"`
	SampleSize int      `json:"sample_size"`
}

// AnalyzeBettingPatterns returns a 0–1 bot-likelihood score from recent action patterns.
func AnalyzeBettingPatterns(req ScoreRequest) ScoreResponse {
	flags := []string{}
	score := 0.0
	n := len(req.Actions)
	if n == 0 {
		return ScoreResponse{UserID: req.UserID, Score: 0, Risk: "unknown", Flags: flags, SampleSize: 0}
	}
	raiseCount := 0
	potFractions := []float64{}
	for _, a := range req.Actions {
		if a.Action == "raise" || a.Action == "bet" {
			raiseCount++
		}
		if a.PotRatio > 0 {
			potFractions = append(potFractions, a.PotRatio)
		}
	}
	raiseRate := float64(raiseCount) / float64(n)
	if raiseRate > 0.45 {
		score += 0.25
		flags = append(flags, "high_aggression_rate")
	}
	if len(potFractions) >= 3 {
		mean, variance := meanVar(potFractions)
		if variance < 0.001 && mean > 0 {
			score += 0.35
			flags = append(flags, "fixed_bet_sizing")
		}
	}
	uniqueActions := map[string]int{}
	for _, a := range req.Actions {
		key, _ := json.Marshal(struct {
			Action string  `json:"action"`
			Ratio  float64 `json:"ratio"`
		}{a.Action, math.Round(a.PotRatio*100) / 100})
		uniqueActions[string(key)]++
	}
	if n >= 8 && len(uniqueActions) <= 2 {
		score += 0.25
		flags = append(flags, "repetitive_action_profile")
	}
	if score > 1 {
		score = 1
	}
	risk := "low"
	switch {
	case score >= 0.65:
		risk = "high"
	case score >= 0.35:
		risk = "medium"
	}
	return ScoreResponse{
		UserID:     req.UserID,
		Score:      math.Round(score*100) / 100,
		Risk:       risk,
		Flags:      flags,
		SampleSize: n,
	}
}

func meanVar(vals []float64) (float64, float64) {
	if len(vals) == 0 {
		return 0, 0
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	mean := sum / float64(len(vals))
	varSum := 0.0
	for _, v := range vals {
		d := v - mean
		varSum += d * d
	}
	return mean, varSum / float64(len(vals))
}
