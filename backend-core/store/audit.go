package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

type AuditEvent struct {
	ID          string          `json:"id"`
	MatchID     string          `json:"match_id"`
	RoomID      string          `json:"room_id"`
	ClubID      string          `json:"club_id"`
	HandNo      int             `json:"hand_no"`
	EventType   string          `json:"event_type"`
	PayloadHash string          `json:"payload_hash"`
	PrevHash    string          `json:"prev_hash"`
	Payload     json.RawMessage `json:"payload"`
	CreatedAt   time.Time       `json:"created_at"`
}

type AuditStore struct {
	db *sql.DB
}

func NewAuditStore(db *sql.DB) *AuditStore {
	return &AuditStore{db: db}
}

func (s *AuditStore) ListByHand(ctx context.Context, matchID string, handNo int) ([]AuditEvent, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, match_id, room_id, club_id, hand_no, event_type, payload_hash, prev_hash, payload_json, created_at
		FROM poker_audit_event
		WHERE match_id = $1 AND hand_no = $2
		ORDER BY created_at ASC, id ASC`, matchID, handNo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditEvent
	for rows.Next() {
		var ev AuditEvent
		if err := rows.Scan(&ev.ID, &ev.MatchID, &ev.RoomID, &ev.ClubID, &ev.HandNo, &ev.EventType,
			&ev.PayloadHash, &ev.PrevHash, &ev.Payload, &ev.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

func (s *AuditStore) ListRecent(ctx context.Context, matchID string, limit int) ([]AuditEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, match_id, room_id, club_id, hand_no, event_type, payload_hash, prev_hash, payload_json, created_at
		FROM poker_audit_event
		WHERE match_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2`, matchID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditEvent
	for rows.Next() {
		var ev AuditEvent
		if err := rows.Scan(&ev.ID, &ev.MatchID, &ev.RoomID, &ev.ClubID, &ev.HandNo, &ev.EventType,
			&ev.PayloadHash, &ev.PrevHash, &ev.Payload, &ev.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}
