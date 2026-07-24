package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

// Profile metadata (#90 completeness): a durable per-account key/value store on
// top of Nakama account metadata. Backs UI state that was previously localStorage
// only — the selected 2.5D avatar, email-notification + privacy preferences, etc.
// — so it follows the player across devices.

// ProfileMetaGet returns the caller's stored metadata object (empty {} if unset).
func ProfileMetaGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	acct, err := nk.AccountGetId(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	meta := "{}"
	if acct.GetUser() != nil && acct.GetUser().GetMetadata() != "" {
		meta = acct.GetUser().GetMetadata()
	}
	out, _ := json.Marshal(map[string]json.RawMessage{"meta": json.RawMessage(meta)})
	return string(out), nil
}

// ProfileMetaSet merges the provided keys into the caller's account metadata.
// Only the keys sent are changed; everything else is preserved.
func ProfileMetaSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)

	var patch map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &patch); err != nil || patch == nil {
		return "", runtime.NewError("expected a JSON object of keys to set", 3)
	}
	// Whitelist the keys we persist so arbitrary blobs can't bloat the account.
	allowed := map[string]bool{
		"avatar": true, "render_mode": true, "email_notifications": true,
		"privacy_mode": true, "bgm": true, "sfx_muted": true, "stack_unit": true,
	}
	for k := range patch {
		if !allowed[k] {
			delete(patch, k)
		}
	}
	if len(patch) == 0 {
		return "", runtime.NewError("no recognized keys to set", 3)
	}

	// Merge onto the existing metadata so unrelated keys survive.
	merged := map[string]interface{}{}
	if acct, err := nk.AccountGetId(ctx, userID); err == nil && acct.GetUser() != nil && acct.GetUser().GetMetadata() != "" {
		_ = json.Unmarshal([]byte(acct.GetUser().GetMetadata()), &merged)
	}
	for k, v := range patch {
		merged[k] = v
	}

	// Empty strings leave username/display/timezone/etc. unchanged.
	if err := nk.AccountUpdateId(ctx, userID, username, merged, "", "", "", "", ""); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "meta": merged})
	return string(out), nil
}
