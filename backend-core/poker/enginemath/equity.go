package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type equityResponse struct {
	Equity     []float32 `json:"equity"`
	Iterations int       `json:"iterations"`
}

// EstimateEquity runs Monte Carlo equity via rs_poker (holes + partial board).
func EstimateEquity(holes []string, board string, iterations int) ([]float32, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"holes":      holes,
		"board":      board,
		"iterations": iterations,
	})
	resp, err := httpClient.Post(baseURL()+"/equity", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("engine-math equity: %s", string(data))
	}
	var out equityResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out.Equity, nil
}
