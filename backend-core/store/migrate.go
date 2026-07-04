package store

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
)

//go:embed schema.sql
var schemaSQL string

func Migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		return fmt.Errorf("poker schema migration: %w", err)
	}
	return nil
}

func NewID(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, mustRand())
}

func mustRand() int64 {
	return int64(randomUint32())
}

// simple LCG random for IDs (no external deps)
var lcgState uint32 = 123456789

func randomUint32() uint32 {
	lcgState = lcgState*1664525 + 1013904223
	return lcgState
}
