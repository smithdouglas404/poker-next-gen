package store

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// GeoStore backs manual jurisdiction rules (poker_geo_rule): per-country allow
// or deny overrides layered on top of the IP→country provider lookup. These are
// the human overrides in "provider country + manual overrides".
type GeoStore struct{ db *sql.DB }

func NewGeoStore(db *sql.DB) *GeoStore { return &GeoStore{db: db} }

// GeoRule is a per-country allow/deny rule.
type GeoRule struct {
	Country   string    `json:"country"` // ISO alpha-2, uppercase
	Rule      string    `json:"rule"`    // "allow" | "deny"
	Reason    string    `json:"reason"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// ListGeoRules returns all country rules, newest first.
func (s *GeoStore) ListGeoRules(ctx context.Context) ([]GeoRule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT country, rule, reason, created_by, created_at
		FROM poker_geo_rule ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GeoRule{}
	for rows.Next() {
		var r GeoRule
		if err := rows.Scan(&r.Country, &r.Rule, &r.Reason, &r.CreatedBy, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetGeoRule upserts a country's allow/deny rule (country is the primary key).
func (s *GeoStore) SetGeoRule(ctx context.Context, country, rule, reason, adminUserID string) error {
	country = strings.ToUpper(strings.TrimSpace(country))
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_geo_rule (country, rule, reason, created_by, created_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (country) DO UPDATE SET
			rule=EXCLUDED.rule, reason=EXCLUDED.reason, created_by=EXCLUDED.created_by, created_at=NOW()`,
		country, rule, reason, adminUserID)
	return err
}

// DeleteGeoRule removes a country rule.
func (s *GeoStore) DeleteGeoRule(ctx context.Context, country string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_geo_rule WHERE country=$1`,
		strings.ToUpper(strings.TrimSpace(country)))
	return err
}

// CheckCountry decides whether a resolved country is permitted. A deny match
// blocks; if any allow rules exist they form an allow-list (a known country not
// on it is blocked). An unknown country ("" — provider failure or local IP) is
// allowed so a lookup outage never bricks play; explicit deny/allow rules for
// known countries are always honored.
func (s *GeoStore) CheckCountry(ctx context.Context, country string) (allowed bool, reason string) {
	country = strings.ToUpper(strings.TrimSpace(country))
	rules, err := s.ListGeoRules(ctx)
	if err != nil {
		return true, ""
	}
	hasAllow := false
	inAllow := false
	for _, r := range rules {
		if r.Rule == "allow" {
			hasAllow = true
		}
		if r.Country == country && country != "" {
			if r.Rule == "deny" {
				return false, "play is not available in your region"
			}
			if r.Rule == "allow" {
				inAllow = true
			}
		}
	}
	if country == "" {
		return true, "" // unknown region: fail-open
	}
	if hasAllow && !inAllow {
		return false, "play is not available in your region"
	}
	return true, ""
}
