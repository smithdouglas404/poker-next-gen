package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

type auditListRequest struct {
	MatchID string `json:"match_id"`
	HandNo  int    `json:"hand_no"`
	Limit   int    `json:"limit"`
}

type auditVerifyRequest struct {
	MatchID string `json:"match_id"`
	HandNo  int    `json:"hand_no"`
}

// AuditList returns audit events for a match hand or recent match history.
func AuditList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req auditListRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	st := store.NewAuditStore(db)
	var events []store.AuditEvent
	var err error
	if req.HandNo > 0 {
		events, err = st.ListByHand(ctx, req.MatchID, req.HandNo)
	} else {
		events, err = st.ListRecent(ctx, req.MatchID, req.Limit)
	}
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"events": events, "count": len(events)})
	return string(out), nil
}

// AuditVerifyHand validates hash chain integrity and deck commitment for a hand.
func AuditVerifyHand(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req auditVerifyRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.MatchID == "" || req.HandNo <= 0 {
		return "", runtime.NewError("match_id and hand_no required", 3)
	}
	events, err := store.NewAuditStore(db).ListByHand(ctx, req.MatchID, req.HandNo)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	chainOK := true
	var chainErrors []string
	var deckHash string
	var deckReveal []string
	var revealSeed string
	for i, ev := range events {
		var payloadMap map[string]any
		_ = json.Unmarshal(ev.Payload, &payloadMap)
		computed := audit.HashPayload(payloadMap)
		if computed != ev.PayloadHash {
			chainOK = false
			chainErrors = append(chainErrors, ev.ID+": payload_hash mismatch")
		}
		expectedPrev := ""
		if i > 0 {
			expectedPrev = events[i-1].PayloadHash
		}
		if ev.PrevHash != expectedPrev {
			chainOK = false
			chainErrors = append(chainErrors, ev.ID+": prev_hash chain break")
		}
		if ev.EventType == "hand_started" {
			if v, ok := payloadMap["deck_commit_hash"].(string); ok {
				deckHash = v
			}
		}
		if ev.EventType == "hand_settled" {
			if v, ok := payloadMap["deck_order"].([]any); ok {
				for _, c := range v {
					if s, ok := c.(string); ok {
						deckReveal = append(deckReveal, s)
					}
				}
			}
			if v, ok := payloadMap["reveal_seed"].(string); ok {
				revealSeed = v
			}
		}
	}
	deckOK := false
	computedDeck := ""
	method := "none"
	if revealSeed != "" && deckHash != "" {
		// Seed-reproducible: reproduce the deck from the revealed seed and confirm
		// SHA-256(seed) == the pre-deal commitment, plus (if present) that the
		// reproduced order matches what was dealt.
		res, err := enginemath.VerifySeed(revealSeed, deckHash)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		deckOK = res.Valid
		if len(deckReveal) == 52 {
			deckOK = deckOK && equalStrings(res.Cards, deckReveal)
		}
		computedDeck = res.Commitment
		method = "seed_reproduce"
	} else if deckHash != "" && len(deckReveal) == 52 {
		// Legacy: verify the revealed order against the order-hash commitment.
		valid, computed, err := enginemath.VerifyDeck(deckReveal, deckHash)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		deckOK = valid
		computedDeck = computed
		method = "order_hash"
	}
	out, _ := json.Marshal(map[string]any{
		"match_id":       req.MatchID,
		"hand_no":        req.HandNo,
		"event_count":    len(events),
		"chain_valid":    chainOK,
		"chain_errors":   chainErrors,
		"deck_valid":     deckOK,
		"deck_commit":    deckHash,
		"reveal_seed":    revealSeed,
		"verify_method":  method,
		"computed_deck":  computedDeck,
		"deck_revealed":  len(deckReveal) == 52,
	})
	return string(out), nil
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
