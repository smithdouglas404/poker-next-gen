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
		// Base model done → try to auto-rig it (best effort) so it animates.
		if g.Stage == "model" {
			if task.ModelURL == "" {
				_ = gens.Fail(ctx, g.ID)
				return generationResult(&store.Generation{ID: g.ID, Status: "failed"}), nil
			}
			if rigTask, rerr := integrations.CreateRigTask(ctx, g.TripoTask); rerr == nil && rigTask != "" {
				_ = gens.AdvanceToRig(ctx, g.ID, task.ModelURL, rigTask)
				return runningStatus("rig", 60), nil
			}
			// Rigging unavailable → mint the base model.
			return mintCharacter(ctx, db, gens, g, userID, task.ModelURL, task.PreviewURL), nil
		}
		// Rig done → attach a preset idle animation (best effort) so the character
		// actually moves at the table; the rigged model is the fallback.
		if g.Stage == "rig" {
			rigged := task.ModelURL
			if rigged == "" {
				rigged = g.BaseModelURL
			}
			if rtTask, rerr := integrations.CreateRetargetTask(ctx, g.TripoTask); rerr == nil && rtTask != "" {
				_ = gens.AdvanceToRetarget(ctx, g.ID, rigged, rtTask)
				return runningStatus("retarget", 80), nil
			}
			return mintCharacter(ctx, db, gens, g, userID, rigged, task.PreviewURL), nil
		}
		// Retarget done → mint the animated GLB (fall back to rigged/base on empty).
		modelURL := task.ModelURL
		if modelURL == "" {
			modelURL = g.BaseModelURL
		}
		return mintCharacter(ctx, db, gens, g, userID, modelURL, task.PreviewURL), nil
	case "failed", "cancelled", "unknown", "expired":
		// If the rig/retarget stage failed but we have an earlier model, mint that.
		if (g.Stage == "rig" || g.Stage == "retarget") && g.BaseModelURL != "" {
			return mintCharacter(ctx, db, gens, g, userID, g.BaseModelURL, ""), nil
		}
		_ = gens.Fail(ctx, g.ID)
		g.Status = "failed"
		return generationResult(g), nil
	default:
		// Tripo reports progress within the CURRENT task. Map it onto the whole
		// three-stage pipeline so the bar does not reset to 0% twice on its way to
		// a finished character.
		return runningStatus(g.Stage, overallProgress(g.Stage, task.Progress)), nil
	}
}

// overallProgress maps a per-task percentage onto the full pipeline. The three
// stages are weighted by roughly how long each takes: modelling dominates,
// rigging and retargeting are shorter.
func overallProgress(stage string, taskProgress int) int {
	if taskProgress < 0 {
		taskProgress = 0
	}
	if taskProgress > 100 {
		taskProgress = 100
	}
	switch stage {
	case "rig":
		return 60 + taskProgress*20/100 // 60 → 80
	case "retarget":
		return 80 + taskProgress*20/100 // 80 → 100
	default: // "model"
		return taskProgress * 60 / 100 // 0 → 60
	}
}

// mintCharacter creates the model cosmetic, grants it, and completes the job.
func mintCharacter(ctx context.Context, db *sql.DB, gens *store.GenerationStore, g *store.Generation, userID, modelURL, previewURL string) string {
	if modelURL == "" {
		_ = gens.Fail(ctx, g.ID)
		return generationResult(&store.Generation{ID: g.ID, Status: "failed"})
	}
	cs := store.NewCosmeticStore(db)
	cid, err := cs.Create(ctx, &store.Cosmetic{
		Kind:        "model",
		Name:        characterName(g.Prompt),
		Rarity:      "legendary",
		AssetRef:    modelURL,
		PreviewRef:  previewURL,
		OwnerUserID: userID,
	})
	if err != nil {
		return generationResult(&store.Generation{ID: g.ID, Status: "failed"})
	}
	_ = cs.Grant(ctx, userID, cid, "generate")

	// Re-host the GLB durably. Tripo's model URL is a temporary signed URL, so an
	// equipped character would break once it expires. Copy the bytes into our own
	// storage and repoint the cosmetic at the stable /api/model/<id> URL. On any
	// failure keep the original Tripo URL (still renders short-term) — never lose
	// the mint the player paid for.
	if data, ct, derr := integrations.DownloadModel(ctx, modelURL); derr == nil && len(data) > 0 {
		if serr := store.NewModelAssetStore(db).Save(ctx, cid, ct, data); serr == nil {
			_ = cs.SetAssetRef(ctx, cid, "/api/model/"+cid)
		}
	}

	_ = gens.Complete(ctx, g.ID, cid)
	g.Status = "success"
	g.CosmeticID = cid
	return generationResult(g)
}

func generationResult(g *store.Generation) string {
	out, _ := json.Marshal(map[string]interface{}{
		"status":      g.Status,
		"cosmetic_id": g.CosmeticID,
		"stage":       g.Stage,
		"stages":      generationStages,
		"progress":    terminalProgress(g.Status),
	})
	return string(out)
}

// generationStages is the real Tripo pipeline, in order. The client renders these
// rather than inventing stage names of its own — the studio previously showed
// "Anatomy Synthesis / Armor Forging / Neural Lighting", none of which are steps
// this pipeline actually performs.
var generationStages = []string{"model", "rig", "retarget"}

func terminalProgress(status string) int {
	if status == "success" {
		return 100
	}
	return 0
}

// runningStatus is the single shape every in-flight response uses, so the client
// always knows which of the three real stages a job is in and never has to infer
// it from a bare percentage.
func runningStatus(stage string, progress int) string {
	if progress < 0 {
		progress = 0
	}
	if progress > 99 {
		progress = 99 // 100 is reserved for a genuinely finished job
	}
	out, _ := json.Marshal(map[string]interface{}{
		"status":   "running",
		"stage":    stage,
		"stages":   generationStages,
		"progress": progress,
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
