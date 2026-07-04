package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// PostgresEmitter persists audit events for hand history and future chain anchoring.
type PostgresEmitter struct {
	db *sql.DB
}

func NewPostgresEmitter(db *sql.DB) *PostgresEmitter {
	return &PostgresEmitter{db: db}
}

func (e *PostgresEmitter) Emit(ctx context.Context, ev Event) error {
	if ev.PayloadHash == "" {
		ev.PayloadHash = HashPayload(ev.Payload)
	}
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now().UTC()
	}
	payloadJSON, err := json.Marshal(ev.Payload)
	if err != nil {
		return err
	}
	id := store.NewID("audit")
	_, err = e.db.ExecContext(ctx, `
		INSERT INTO poker_audit_event (id, match_id, room_id, club_id, hand_no, event_type, payload_hash, payload_json, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id,
		ev.MatchID,
		ev.RoomID,
		ev.ClubID,
		ev.HandNo,
		ev.Type,
		ev.PayloadHash,
		payloadJSON,
		ev.Timestamp,
	)
	return err
}
