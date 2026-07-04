package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// RankOmaha evaluates a PLO hand via rs_poker (engine-math).
func RankOmaha(hole, board string) (string, error) {
	body, _ := json.Marshal(map[string]string{"hole": hole, "board": board})
	resp, err := httpClient.Post(baseURL()+"/omaha/rank", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("engine-math omaha rank: %s", string(data))
	}
	var out rankResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return "", err
	}
	return out.Category, nil
}

// ResolveOmahaShowdown returns winner indices into holes via rs_poker.
func ResolveOmahaShowdown(holes []string, board string) ([]int, []string, error) {
	body, _ := json.Marshal(map[string]any{"holes": holes, "board": board})
	resp, err := httpClient.Post(baseURL()+"/omaha/showdown", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("engine-math omaha showdown: %s", string(data))
	}
	var out struct {
		Winners    []int    `json:"winners"`
		Categories []string `json:"categories"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, nil, err
	}
	return out.Winners, out.Categories, nil
}
