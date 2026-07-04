package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"time"
)

// Event is an immutable audit record suitable for blockchain anchoring later.
type Event struct {
	Type        string
	MatchID     string
	HandNo      int
	RoomID      string
	ClubID      string
	Payload     map[string]any
	PayloadHash string
	Timestamp   time.Time
}

// Emitter sinks audit events (Postgres now; IPFS/L2 later).
type Emitter interface {
	Emit(ctx context.Context, ev Event) error
}

// MultiEmitter fan-out to multiple sinks.
type MultiEmitter struct {
	Sinks []Emitter
}

func (m MultiEmitter) Emit(ctx context.Context, ev Event) error {
	for _, s := range m.Sinks {
		if err := s.Emit(ctx, ev); err != nil {
			return err
		}
	}
	return nil
}

// HashPayload returns a deterministic SHA-256 of canonical JSON payload.
func HashPayload(payload map[string]any) string {
	if payload == nil {
		payload = map[string]any{}
	}
	b := canonicalJSON(payload)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func canonicalJSON(v any) []byte {
	// Sort map keys for stable hashes.
	if m, ok := v.(map[string]any); ok {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make(map[string]any, len(m))
		for _, k := range keys {
			out[k] = m[k]
		}
		b, _ := json.Marshal(out)
		return b
	}
	b, _ := json.Marshal(v)
	return b
}

// NoopEmitter discards events (tests / disabled audit).
type NoopEmitter struct{}

func (NoopEmitter) Emit(context.Context, Event) error { return nil }
