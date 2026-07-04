package enginemath

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

var (
	availableCache bool
	cacheExpiry    time.Time
	cacheMu        sync.Mutex
)

func cachedAvailable() bool {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if time.Now().Before(cacheExpiry) {
		return availableCache
	}
	resp, err := httpClient.Get(baseURL() + "/health")
	if err != nil {
		availableCache = false
	} else {
		resp.Body.Close()
		availableCache = resp.StatusCode == http.StatusOK
	}
	cacheExpiry = time.Now().Add(5 * time.Second)
	return availableCache
}

// ShuffleDeck returns 52 card codes from the engine-math CSPRNG shuffle endpoint.
func ShuffleDeck() ([]string, error) {
	resp, err := httpClient.Post(baseURL()+"/shuffle", "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("engine-math shuffle: %s", string(data))
	}
	var out struct {
		Cards []string `json:"cards"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out.Cards, nil
}
