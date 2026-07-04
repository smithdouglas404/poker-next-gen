package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type showdownResponse struct {
	Winners    []int    `json:"winners"`
	Categories []string `json:"categories"`
}

// ResolveShowdown returns winner indices into holes (ties allowed) via rs_poker.
func ResolveShowdown(holes []string, board string) ([]int, []string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"holes": holes,
		"board": board,
	})
	resp, err := httpClient.Post(baseURL()+"/showdown", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("engine-math showdown: %s", string(data))
	}
	var out showdownResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, nil, err
	}
	return out.Winners, out.Categories, nil
}
