package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/geo"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// clientIP reads the caller's IP from the runtime context (set by Nakama for
// both RPC and socket-authenticated calls). Empty when unavailable.
func clientIP(ctx context.Context) string {
	if v, ok := ctx.Value(runtime.RUNTIME_CTX_CLIENT_IP).(string); ok {
		return v
	}
	return ""
}

// guardJurisdiction enforces the connect/jurisdiction gate: manual IP allow/deny
// rules plus the IP->country geofence (provider lookup + manual country
// overrides). Returns a user-facing error when the caller is blocked. Applied at
// the money/entry chokepoints (table create, deposits). It is intentionally
// fail-open on unknown IP/country so an outage or local dev never bricks play,
// while explicit admin rules are always honored.
func guardJurisdiction(ctx context.Context, db *sql.DB) error {
	ip := clientIP(ctx)
	if ip == "" {
		return nil
	}
	if ok, reason := store.NewAdminStore(db).CheckIP(ctx, ip); !ok {
		return runtime.NewError(reason, 7) // PermissionDenied
	}
	country := geo.Country(ctx, ip)
	if ok, reason := store.NewGeoStore(db).CheckCountry(ctx, country); !ok {
		return runtime.NewError(reason, 7)
	}
	return nil
}

// JurisdictionCheck lets the client confirm its region is permitted before it
// enters a table. Returns {allowed, country, reason}. The client uses this to
// show a clean "not available in your region" state instead of a failed action;
// the money/entry RPCs re-check server-side (this is not the security boundary).
func JurisdictionCheck(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	ip := clientIP(ctx)
	country := geo.Country(ctx, ip)
	allowed := true
	reason := ""
	if ok, r := store.NewAdminStore(db).CheckIP(ctx, ip); !ok {
		allowed, reason = false, r
	} else if ok, r := store.NewGeoStore(db).CheckCountry(ctx, country); !ok {
		allowed, reason = false, r
	}
	out, _ := json.Marshal(map[string]interface{}{
		"allowed": allowed,
		"country": country,
		"reason":  reason,
	})
	return string(out), nil
}

// GeoRuleList returns all country allow/deny rules. Admin-gated.
func GeoRuleList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	rules, err := store.NewGeoStore(db).ListGeoRules(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"rules": rules})
	return string(out), nil
}

// GeoRuleSet upserts a country allow/deny rule. Admin-gated, audited.
func GeoRuleSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Country string `json:"country"`
		Rule    string `json:"rule"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || len(req.Country) != 2 {
		return "", runtime.NewError("country (ISO alpha-2) required", 3)
	}
	if req.Rule != "allow" && req.Rule != "deny" {
		return "", runtime.NewError("rule must be allow or deny", 3)
	}
	if err := store.NewGeoStore(db).SetGeoRule(ctx, req.Country, req.Rule, req.Reason, adminID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "geo_rule_set", req.Country, map[string]interface{}{
		"country": req.Country, "rule": req.Rule, "reason": req.Reason,
	})
	return `{"ok":true}`, nil
}

// GeoRuleDelete removes a country rule. Admin-gated, audited.
func GeoRuleDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Country string `json:"country"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Country == "" {
		return "", runtime.NewError("country required", 3)
	}
	if err := store.NewGeoStore(db).DeleteGeoRule(ctx, req.Country); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, adminID, "geo_rule_delete", req.Country, nil)
	return `{"ok":true}`, nil
}
