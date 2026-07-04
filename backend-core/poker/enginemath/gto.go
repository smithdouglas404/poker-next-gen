package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type GtoAdvice struct {
	SuggestedAction string  `json:"suggested_action"`
	HeroEquity      float64 `json:"hero_equity"`
	PotOdds         float64 `json:"pot_odds"`
	EVCall          float64 `json:"ev_call"`
	Engine          string  `json:"engine"`
	Note            string  `json:"note"`
	Rationale       string  `json:"rationale"`
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
