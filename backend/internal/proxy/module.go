package proxy

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/response"
	"skyport/internal/security"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "proxy" }

func (m *Module) Register(a *app.App) error {
	pr := a.Fiber.Group("/api/v1/proxy")
	pr.Use(auth.RequireJWT(a.Config.JWTSecret))
	pr.Post("/generate", generateHandler(a))
	return nil
}

type generateRequest struct {
	Domain string `json:"domain" validate:"required,max=255"`
	Port   int    `json:"port" validate:"required,min=1,max=65535"`
	Type   string `json:"type" validate:"omitempty,oneof=caddy nginx"`
}

// @Summary Generate reverse proxy config
// @Tags Proxy
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body generateRequest true "Proxy generation input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/proxy/generate [post]
func generateHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req generateRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		t := req.Type
		if t == "" {
			t = "caddy"
		}
		name := security.SafeName(req.Domain)
		base := filepath.Join(a.Config.WorkspaceRoot, "proxy")
		_ = os.MkdirAll(base, 0o755)
		path := filepath.Join(base, fmt.Sprintf("%s.%s.conf", name, t))

		content := ""
		if t == "nginx" {
			content = fmt.Sprintf("server {\n  listen 80;\n  server_name %s;\n  location / {\n    proxy_pass http://127.0.0.1:%d;\n  }\n}\n", req.Domain, req.Port)
		} else {
			content = fmt.Sprintf("%s {\n  reverse_proxy 127.0.0.1:%d\n}\n", req.Domain, req.Port)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return err
		}
		return response.OK(c, fiber.Map{
			"type":            t,
			"path":            path,
			"reload_command":  strings.TrimSpace(map[string]string{"caddy": "caddy reload --config /etc/caddy/Caddyfile", "nginx": "nginx -s reload"}[t]),
			"ssl_ready_notes": "SSL automation intentionally not enabled yet; config is prepared for future extension.",
		})
	}
}
