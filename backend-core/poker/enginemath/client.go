package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultURL = "http://engine-math:8080"

type rankResponse struct {
	Category string `json:"category"`
}

type compareResponse struct {
	Ordering string `json:"ordering"`
}

func baseURL() string {
	if u := os.Getenv("ENGINE_MATH_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return defaultURL
}

var httpClient = &http.Client{Timeout: 2 * time.Second}

// RankHand evaluates cards via rs_poker (engine-math HTTP sidecar).
func RankHand(cards string) (string, error) {
	body, _ := json.Marshal(map[string]string{"cards": cards})
	resp, err := httpClient.Post(baseURL()+"/rank", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("engine-math rank: %s", string(data))
	}
	var out rankResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return "", err
	}
	return out.Category, nil
}

// CompareHands returns 1 if a wins, -1 if b wins, 0 if tie.
func CompareHands(a, b string) (int, error) {
	body, _ := json.Marshal(map[string]string{"a": a, "b": b})
	resp, err := httpClient.Post(baseURL()+"/compare", "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("engine-math compare: %s", string(data))
	}
	var out compareResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return 0, err
	}
	switch out.Ordering {
	case "greater":
		return 1, nil
	case "less":
		return -1, nil
	default:
		return 0, nil
	}
}

func Available() bool {
	return cachedAvailable()
}
