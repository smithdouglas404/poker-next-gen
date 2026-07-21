package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type ShuffleResult struct {
	Cards      []string
	DeckHash   string
	Seed       string // hex 32-byte seed — revealed only AFTER the hand
	Commitment string // SHA-256(seed) — the pre-deal commit shown to players
}

// ShuffleDeck returns 52 card codes plus the seed-reproducible provably-fair
// commitment from engine-math (seed + SHA-256(seed)).
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
		Cards      []string `json:"cards"`
		DeckHash   string   `json:"deck_hash"`
		Seed       string   `json:"seed"`
		Commitment string   `json:"commitment"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return ShuffleResult{}, err
	}
	return ShuffleResult{Cards: out.Cards, DeckHash: out.DeckHash, Seed: out.Seed, Commitment: out.Commitment}, nil
}

// SeedVerifyResult is the reproduced deck and commitment for a revealed seed.
type SeedVerifyResult struct {
	Cards      []string
	Commitment string
	Valid      bool
}

// VerifySeed reproduces the deck from a revealed seed and confirms its
// commitment (SHA-256 of the seed) via engine-math — the seed-reproducible
// provably-fair check.
func VerifySeed(seed, commitment string) (SeedVerifyResult, error) {
	body, _ := json.Marshal(map[string]string{"seed": seed, "commitment": commitment})
	resp, err := httpClient.Post(baseURL()+"/shuffle/verify", "application/json", bytes.NewReader(body))
	if err != nil {
		return SeedVerifyResult{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return SeedVerifyResult{}, fmt.Errorf("engine-math seed verify: %s", string(data))
	}
	var out struct {
		Cards      []string `json:"cards"`
		Commitment string   `json:"commitment"`
		Valid      bool     `json:"valid"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return SeedVerifyResult{}, err
	}
	return SeedVerifyResult{Cards: out.Cards, Commitment: out.Commitment, Valid: out.Valid}, nil
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
