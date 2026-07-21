package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strconv"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// characterGenFeeCents is the fee to generate a character (covers Tripo credits
// + margin). Configurable via CHARACTER_GEN_FEE_CENTS; defaults to $5.
func characterGenFeeCents() int64 {
	if v := os.Getenv("CHARACTER_GEN_FEE_CENTS"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	return 500
}

// CharacterGenerate charges the generation fee from the wallet and kicks off a
// Tripo3D text→3D job. The resulting model is minted into the caller's inventory
// when the job completes (poll via character_generation_status). Dormant without
// TRIPO_API_KEY.
func CharacterGenerate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if len(req.Prompt) < 3 {
		return "", runtime.NewError("describe the character you want to generate", 3)
	}
	if !integrations.TripoConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "Character generation isn't configured yet (set TRIPO_API_KEY).",
		})
		return string(out), nil
	}

	fee := characterGenFeeCents()
	if fee > 0 {
		if err := store.NewWalletStore(db).Debit(ctx, userID, fee, "character_generate_fee"); err != nil {
			return "", runtime.NewError("generation fee requires a balance of "+dollars(fee)+" — add funds", 9)
		}
	}

	gens := store.NewGenerationStore(db)
	genID, err := gens.Create(ctx, userID, req.Prompt, fee)
	if err != nil {
		if fee > 0 {
			_ = store.NewWalletStore(db).Credit(ctx, userID, fee, "character_generate_refund")
		}
		return "", runtime.NewError(err.Error(), 13)
	}

	taskID, err := integrations.CreateTextToModel(ctx, req.Prompt)
	if err != nil {
		logger.Error("tripo create task: %v", err)
		_ = gens.Fail(ctx, genID)
		if fee > 0 {
			_ = store.NewWalletStore(db).Credit(ctx, userID, fee, "character_generate_refund")
		}
		return "", runtime.NewError("generation service error", 13)
	}
	_ = gens.SetTaskID(ctx, genID, taskID)

	out, _ := json.Marshal(map[string]interface{}{
		"configured":    true,
		"generation_id": genID,
		"status":        "running",
	})
	return string(out), nil
}

// CharacterGenerationStatus polls a generation job. On Tripo success it mints the
// GLB as a `model` cosmetic in the caller's inventory (once), then reports done.
func CharacterGenerationStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		GenerationID string `json:"generation_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.GenerationID == "" {
		return "", runtime.NewError("generation_id required", 3)
	}
	gens := store.NewGenerationStore(db)
	g, err := gens.GetByID(ctx, req.GenerationID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if g == nil || g.UserID != userID {
		return "", runtime.NewError("generation not found", 5)
	}

	// Terminal states: report the minted cosmetic (if any).
	if g.Status == "success" || g.Status == "failed" {
		return generationResult(g), nil
	}

	task, err := integrations.GetTask(ctx, g.TripoTask)
	if err != nil {
		return "", runtime.NewError("status check failed", 13)
	}
	switch strings.ToLower(task.Status) {
	case "success":
		if task.ModelURL == "" {
			_ = gens.Fail(ctx, g.ID)
			return generationResult(&store.Generation{ID: g.ID, Status: "failed"}), nil
		}
		cid, err := store.NewCosmeticStore(db).Create(ctx, &store.Cosmetic{
			Kind:        "model",
			Name:        characterName(g.Prompt),
			Rarity:      "legendary",
			AssetRef:    task.ModelURL,
			PreviewRef:  task.PreviewURL,
			OwnerUserID: userID,
		})
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		if err := store.NewCosmeticStore(db).Grant(ctx, userID, cid, "generate"); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		_ = gens.Complete(ctx, g.ID, cid)
		g.Status = "success"
		g.CosmeticID = cid
		return generationResult(g), nil
	case "failed", "cancelled", "unknown", "expired":
		_ = gens.Fail(ctx, g.ID)
		g.Status = "failed"
		return generationResult(g), nil
	default:
		out, _ := json.Marshal(map[string]interface{}{
			"status":   "running",
			"progress": task.Progress,
		})
		return string(out), nil
	}
}

func generationResult(g *store.Generation) string {
	out, _ := json.Marshal(map[string]interface{}{
		"status":      g.Status,
		"cosmetic_id": g.CosmeticID,
	})
	return string(out)
}

func characterName(prompt string) string {
	p := strings.TrimSpace(prompt)
	if len(p) > 40 {
		p = p[:40]
	}
	if p == "" {
		return "Custom Character"
	}
	return p
}
