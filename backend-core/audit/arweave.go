package audit

import (
	"context"
	"log"
	"os"
)

// ArweaveEmitter is a stub for future Arweave/IPFS anchoring of audit events.
// When ARWEAVE_ANCHOR_URL is set, logs the anchor intent; otherwise no-ops.
type ArweaveEmitter struct{}

func NewArweaveEmitter() *ArweaveEmitter {
	return &ArweaveEmitter{}
}

func (e *ArweaveEmitter) Emit(ctx context.Context, ev Event) error {
	url := os.Getenv("ARWEAVE_ANCHOR_URL")
	if url == "" {
		return nil
	}
	log.Printf("audit anchor stub: type=%s match=%s hand=%d hash=%s prev=%s url=%s",
		ev.Type, ev.MatchID, ev.HandNo, ev.PayloadHash, ev.PrevHash, url)
	return nil
}
