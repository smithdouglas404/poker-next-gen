package coaching

import (
	"fmt"
	"strings"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

type TipRequest struct {
	HeroHole      string   `json:"hero_hole"`
	VillainHoles  []string `json:"villain_holes"`
	Board         string   `json:"board"`
	Pot           float64  `json:"pot"`
	ToCall        float64  `json:"to_call"`
	LastAction    string   `json:"last_action"`
	Iterations    int      `json:"iterations"`
}

type TipResponse struct {
	Alert       string  `json:"alert"`
	Severity    string  `json:"severity"`
	Suggestion  string  `json:"suggestion"`
	HeroEquity  float64 `json:"hero_equity"`
	PotOdds     float64 `json:"pot_odds"`
	Rationale   string  `json:"rationale"`
	Engine      string  `json:"engine"`
}

// Analyze returns a Smart HUD coaching tip from equity + pot odds heuristics.
func Analyze(req TipRequest) (TipResponse, error) {
	if req.HeroHole == "" {
		return TipResponse{}, fmt.Errorf("hero_hole required")
	}
	iters := req.Iterations
	if iters <= 0 {
		iters = 1500
	}
	advice, err := enginemath.GtoAdvise(req.HeroHole, req.VillainHoles, strings.TrimSpace(req.Board), req.Pot, req.ToCall, iters)
	if err != nil {
		return TipResponse{}, err
	}
	resp := TipResponse{
		Suggestion: advice.SuggestedAction,
		HeroEquity: advice.HeroEquity,
		PotOdds:    advice.PotOdds,
		Rationale:  advice.Rationale,
		Engine:     "rs_poker_coaching",
		Severity:   "info",
	}
	switch advice.SuggestedAction {
	case "fold":
		if advice.HeroEquity < advice.PotOdds-0.1 {
			resp.Alert = "Likely mistake: calling with insufficient equity"
			resp.Severity = "warning"
		} else {
			resp.Alert = "Marginal fold spot"
		}
	case "call":
		if advice.HeroEquity >= advice.PotOdds+0.15 {
			resp.Alert = "Strong call — equity well above pot odds"
			resp.Severity = "success"
		} else {
			resp.Alert = "Close decision — mixed strategy"
		}
	case "bet":
		resp.Alert = "Value opportunity — bet for protection/value"
		resp.Severity = "success"
	default:
		resp.Alert = "Pot control spot"
	}
	if req.LastAction == "raise" && advice.SuggestedAction == "call" && advice.HeroEquity < 0.35 {
		resp.Alert = "Facing aggression with weak equity — consider folding"
		resp.Severity = "warning"
	}
	return resp, nil
}
