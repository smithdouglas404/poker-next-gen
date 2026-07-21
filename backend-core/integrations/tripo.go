// Package integrations wraps third-party generative/model services.
//
// Tripo3D (https://developers.tripo3d.ai) generates GLB character models from a
// text prompt (async: create task → poll → download). Env-gated on TRIPO_API_KEY
// so the app runs fine before generation is turned on. Optionally rigs/animates
// the result so characters can move at the table.
package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const tripoAPI = "https://api.tripo3d.ai/v2/openapi"

// TripoConfigured reports whether generation is enabled.
func TripoConfigured() bool {
	return os.Getenv("TRIPO_API_KEY") != ""
}

func tripoDo(ctx context.Context, method, path string, body []byte) ([]byte, int, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, tripoAPI+path, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("TRIPO_API_KEY"))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, err
}

// CreateTextToModel starts a text→3D generation and returns the Tripo task id.
func CreateTextToModel(ctx context.Context, prompt string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"type":   "text_to_model",
		"prompt": prompt,
	})
	raw, status, err := tripoDo(ctx, http.MethodPost, "/task", body)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", fmt.Errorf("tripo create task http %d: %s", status, string(raw))
	}
	var out struct {
		Code int `json:"code"`
		Data struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Data.TaskID == "" {
		return "", fmt.Errorf("tripo create task: no task id (%s)", string(raw))
	}
	return out.Data.TaskID, nil
}

// TripoTask is the subset of a task we act on.
type TripoTask struct {
	Status   string // queued | running | success | failed | ...
	Progress int
	ModelURL string
	PreviewURL string
}

// GetTask polls a generation task. On success ModelURL points to the GLB.
func GetTask(ctx context.Context, taskID string) (TripoTask, error) {
	raw, status, err := tripoDo(ctx, http.MethodGet, "/task/"+taskID, nil)
	if err != nil {
		return TripoTask{}, err
	}
	if status >= 300 {
		return TripoTask{}, fmt.Errorf("tripo get task http %d: %s", status, string(raw))
	}
	var out struct {
		Data struct {
			Status   string `json:"status"`
			Progress int    `json:"progress"`
			Output   struct {
				Model         string `json:"model"`
				PBRModel      string `json:"pbr_model"`
				RenderedImage string `json:"rendered_image"`
			} `json:"output"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return TripoTask{}, err
	}
	model := out.Data.Output.PBRModel
	if model == "" {
		model = out.Data.Output.Model
	}
	return TripoTask{
		Status:     out.Data.Status,
		Progress:   out.Data.Progress,
		ModelURL:   model,
		PreviewURL: out.Data.Output.RenderedImage,
	}, nil
}
