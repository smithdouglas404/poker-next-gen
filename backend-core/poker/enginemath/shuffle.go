package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type ShuffleResult struct {
	Cards    []string
	DeckHash string
}

// ShuffleDeck returns 52 card codes and a SHA-256 commitment from engine-math.
func ShuffleDeck() (ShuffleResult, error) {
	resp, err := httpClient.Post(baseURL()+"/shuffle", "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		return ShuffleResult{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return ShuffleResult{}, fmt.Errorf("engine-math shuffle: %s", string(data))
	}
	var out struct {
		Cards    []string `json:"cards"`
		DeckHash string   `json:"deck_hash"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return ShuffleResult{}, err
	}
	return ShuffleResult{Cards: out.Cards, DeckHash: out.DeckHash}, nil
}

// VerifyDeck checks a deck order against a commitment hash via engine-math.
func VerifyDeck(cards []string, deckHash string) (bool, string, error) {
	body, _ := json.Marshal(map[string]any{"cards": cards, "deck_hash": deckHash})
	resp, err := httpClient.Post(baseURL()+"/deck/verify", "application/json", bytes.NewReader(body))
	if err != nil {
		return false, "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return false, "", fmt.Errorf("engine-math deck verify: %s", string(data))
	}
	var out struct {
		Valid        bool   `json:"valid"`
		ComputedHash string `json:"computed_hash"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return false, "", err
	}
	return out.Valid, out.ComputedHash, nil
}
