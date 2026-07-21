package store

import (
	"context"
	"crypto/rand"
	"database/sql"
)

// RoomCodeStore maps short shareable codes to match ids so players can join a
// private table by code or link (PokerNow-style) instead of a long match UUID.
type RoomCodeStore struct{ db *sql.DB }

func NewRoomCodeStore(db *sql.DB) *RoomCodeStore { return &RoomCodeStore{db: db} }

// Unambiguous alphabet (no 0/O/1/I) for human-friendly, readable codes.
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func newRoomCode(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	out := make([]byte, n)
	for i := range b {
		out[i] = roomCodeAlphabet[int(b[i])%len(roomCodeAlphabet)]
	}
	return string(out)
}

// Create allocates a fresh 6-char code for a match and stores the mapping,
// retrying on the rare collision.
func (s *RoomCodeStore) Create(ctx context.Context, matchID string) (string, error) {
	for attempt := 0; attempt < 6; attempt++ {
		code := newRoomCode(6)
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO poker_room_code (code, match_id) VALUES ($1,$2)`, code, matchID)
		if err == nil {
			return code, nil
		}
	}
	return "", sql.ErrNoRows
}

// Resolve returns the match id for a code (empty if unknown).
func (s *RoomCodeStore) Resolve(ctx context.Context, code string) (string, error) {
	var matchID string
	err := s.db.QueryRowContext(ctx,
		`SELECT match_id FROM poker_room_code WHERE code=$1`, code).Scan(&matchID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return matchID, err
}
