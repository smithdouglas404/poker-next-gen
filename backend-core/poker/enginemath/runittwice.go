package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type runItTwiceResponse struct {
	Boards []string `json:"boards"`
	Engine string   `json:"engine"`
}

// RunItTwice asks engine-math (rs_poker) to deal `boards` independent runouts of
// the remaining community board from the known dead cards. `board` is the current
// partial board (concatenated 2-char codes, e.g. "AsKd7c"); `dead` is every
// player's hole-card string. Returns one full 5-card board string per runout.
func RunItTwice(board string, dead []string, boards int) ([]string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"board":  board,
		"dead":   dead,
		"boards": boards,
	})
	resp, err := httpClient.Post(baseURL()+"/run_it_twice", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("engine-math run_it_twice: %s", string(data))
	}
	var out runItTwiceResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	if len(out.Boards) == 0 {
		return nil, fmt.Errorf("engine-math run_it_twice: no boards returned")
	}
	return out.Boards, nil
}
