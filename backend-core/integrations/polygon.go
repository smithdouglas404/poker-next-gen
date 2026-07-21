// Polygon Merkle-root anchoring.
//
// Rather than bundling a full Ethereum signing stack into the Nakama plugin, the
// backend posts a batch's Merkle root to a configurable relay endpoint
// (POLYGON_ANCHOR_URL) that performs the on-chain submission and returns the tx
// hash. The operator runs that tiny relay (or uses a managed service) holding the
// signing key — the plugin never holds a hot key. Dormant without config.
package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// PolygonAnchorConfigured reports whether on-chain anchoring is enabled.
func PolygonAnchorConfigured() bool {
	return os.Getenv("POLYGON_ANCHOR_URL") != ""
}

// SubmitMerkleRoot posts the root to the anchor relay and returns the tx hash.
func SubmitMerkleRoot(ctx context.Context, merkleRoot string, eventCount int) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"merkle_root": merkleRoot,
		"event_count": eventCount,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, os.Getenv("POLYGON_ANCHOR_URL"), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("POLYGON_ANCHOR_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("anchor relay http %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		TxHash string `json:"tx_hash"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.TxHash == "" {
		return "", fmt.Errorf("anchor relay: no tx_hash in response")
	}
	return out.TxHash, nil
}
