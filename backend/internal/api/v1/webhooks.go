package v1

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	dockerq "skyport/internal/deployments/docker"
	"skyport/internal/response"
)

func mountWebhooks(a *app.App, r fiber.Router) {
	fmt.Println("Registering webhook routes under /api/v1/webhooks")
	api := r.Group("/webhooks")
	api.Post("/github/:projectId", handleGitHubWebhook(a))
}

func handleGitHubWebhook(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		projectIdStr := c.Params("projectId")
		if projectIdStr == "" {
			return response.BadRequest(c, "missing project id")
		}
		body := c.Body()

		// Validate signature when secret present
		secret := a.Config.GitHubWebhookSecret
		if secret != "" {
			sig := c.Get("X-Hub-Signature-256")
			if sig == "" {
				return response.Error(c, http.StatusUnauthorized, "invalid_signature", "missing signature header")
			}
			mac := hmac.New(sha256.New, []byte(secret))
			_, _ = mac.Write(body)
			expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
			if !hmac.Equal([]byte(expected), []byte(sig)) {
				return response.Error(c, http.StatusUnauthorized, "invalid_signature", "signature mismatch")
			}
		}

		// Parse minimal payload
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil && len(body) > 0 {
			return response.BadRequest(c, "invalid payload")
		}
		// Get commit sha
		commit := ""
		if h, ok := payload["head_commit"].(map[string]any); ok {
			if id, ok := h["id"].(string); ok {
				commit = id
			}
		}
		// Fallback to after
		if commit == "" {
			if after, ok := payload["after"].(string); ok {
				commit = after
			}
		}
		ref := ""
		if r, ok := payload["ref"].(string); ok {
			ref = r
		}
		branch := ref
		if strings.HasPrefix(ref, "refs/heads/") {
			branch = strings.TrimPrefix(ref, "refs/heads/")
		}

		// Enqueue deployment job
		dockerq.DefaultQueue.Enqueue(uintFromString(projectIdStr), dockerq.WebhookPayload{CommitSHA: commit, Branch: branch, Ref: ref})

		return response.OK(c, fiber.Map{"status": "enqueued"})
	}
}

func uintFromString(s string) uint {
	var out uint = 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			out = out*10 + uint(r-'0')
		}
	}
	return out
}
