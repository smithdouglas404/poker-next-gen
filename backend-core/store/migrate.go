package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
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
	// Strip `--` line comments BEFORE splitting on `;`. A comment may itself
	// contain a semicolon (e.g. "-- writes status; clients read it"); splitting
	// first would break the comment across statements and leak its trailing text
	// into the next CREATE, producing a syntax error on a fresh database.
	var b strings.Builder
	for _, line := range strings.Split(raw, "\n") {
		if i := strings.Index(line, "--"); i >= 0 {
			line = line[:i]
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	parts := strings.Split(b.String(), ";")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" {
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

// NewID returns a collision-resistant, unpredictable ID (prefix + 96 random
// bits). The previous implementation used a constant-seeded LCG that reset on
// every process restart — producing predictable, restart-colliding primary
// keys, unsafe for a money system.
func NewID(prefix string) string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand should never fail; degrade to a time-based unique-ish id.
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return prefix + "_" + hex.EncodeToString(b[:])
}

