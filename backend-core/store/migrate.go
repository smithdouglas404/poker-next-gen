package store

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"strings"
)

//go:embed schema.sql
var schemaSQL string

func Migrate(ctx context.Context, db *sql.DB) error {
	for _, stmt := range splitSQL(schemaSQL) {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("poker schema migration (%q): %w", truncate(stmt, 80), err)
		}
	}
	return nil
}

func splitSQL(raw string) []string {
	parts := strings.Split(raw, ";")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" || strings.HasPrefix(stmt, "--") {
			continue
		}
		out = append(out, stmt)
	}
	return out
}

func truncate(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func NewID(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, mustRand())
}

func mustRand() int64 {
	return int64(randomUint32())
}

var lcgState uint32 = 123456789

func randomUint32() uint32 {
	lcgState = lcgState*1664525 + 1013904223
	return lcgState
}
