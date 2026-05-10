package proxy

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	pr.Post("/certbot", certbotHandler())
	return nil
}

type generateRequest struct {
	Domain    string `json:"domain" validate:"required,max=255"`
	Port      int    `json:"port" validate:"required,min=1,max=65535"`
	Type      string `json:"type" validate:"omitempty,oneof=caddy nginx"`
	EnableSSL bool   `json:"enable_ssl"`
	Email     string `json:"email" validate:"omitempty,max=255"`
	CertPath  string `json:"cert_path" validate:"omitempty,max=1024"`
	KeyPath   string `json:"key_path" validate:"omitempty,max=1024"`
	Reload    bool   `json:"reload"`
	Execute   bool   `json:"execute"`
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
			if req.EnableSSL && (req.CertPath == "" || req.KeyPath == "") {
				return response.BadRequest(c, "cert_path and key_path are required for nginx SSL")
			}
			sslBlock := ""
			if req.EnableSSL {
				sslBlock = fmt.Sprintf("  listen 443 ssl;\n  ssl_certificate %s;\n  ssl_certificate_key %s;\n", req.CertPath, req.KeyPath)
			}
			content = fmt.Sprintf("server {\n  listen 80;\n%s  server_name %s;\n  location / {\n    proxy_pass http://127.0.0.1:%d;\n  }\n}\n", sslBlock, req.Domain, req.Port)
		} else {
			tlsLine := ""
			if req.EnableSSL && req.Email != "" {
				tlsLine = fmt.Sprintf("  tls %s\n", req.Email)
			}
			content = fmt.Sprintf("%s {\n%s  reverse_proxy 127.0.0.1:%d\n}\n", req.Domain, tlsLine, req.Port)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			return err
		}
		output := ""
		reloadError := ""
		reloadCmd := strings.TrimSpace(map[string]string{"caddy": "caddy reload --config /etc/caddy/Caddyfile", "nginx": "nginx -s reload"}[t])
		if req.Reload && req.Execute {
			bin := t
			if t == "caddy" {
				bin = "caddy"
			}
			if _, err := exec.LookPath(bin); err != nil {
				reloadError = bin + " not found on PATH"
				return response.OK(c, fiber.Map{
					"type":            t,
					"path":            path,
					"reload_command":  reloadCmd,
					"reload_executed": false,
					"reload_output":   "",
					"reload_error":    reloadError,
					"ssl_ready_notes": "Caddy auto-TLS is enabled when enable_ssl=true; Nginx requires cert_path/key_path or certbot.",
				})
			}
			cmd := exec.Command("sh", "-c", reloadCmd)
			if runtime.GOOS == "windows" {
				cmd = exec.Command("powershell", "-NoProfile", "-Command", reloadCmd)
			}
			out, err := cmd.CombinedOutput()
			output = strings.TrimSpace(string(out))
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "proxy_reload_failed", err.Error(), fiber.Map{"output": output, "command": reloadCmd})
			}
		}
		return response.OK(c, fiber.Map{
			"type":            t,
			"path":            path,
			"reload_command":  reloadCmd,
			"reload_executed": req.Reload && req.Execute,
			"reload_output":   output,
			"reload_error":    reloadError,
			"ssl_ready_notes": "Caddy auto-TLS is enabled when enable_ssl=true; Nginx requires cert_path/key_path or certbot.",
		})
	}
}

type certbotRequest struct {
	Domain  string `json:"domain" validate:"required,max=255"`
	Email   string `json:"email" validate:"required,max=255"`
	DryRun  bool   `json:"dry_run"`
	Execute bool   `json:"execute"`
}

// @Summary Certbot helper
// @Tags Proxy
// @Security BearerAuth
// @Accept json
// @Produce json
// @Description Returns or executes a certbot command for Nginx SSL.
// @Param request body certbotRequest true "Certbot input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/proxy/certbot [post]
func certbotHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req certbotRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		if runtime.GOOS != "linux" {
			return response.Error(c, fiber.StatusBadRequest, "unsupported_os", "certbot helper is only supported on Linux")
		}
		cmd := fmt.Sprintf("certbot certonly --standalone -d %s --non-interactive --agree-tos -m %s", req.Domain, req.Email)
		effectiveExecute := req.Execute && !req.DryRun
		output := ""
		if effectiveExecute {
			out, err := exec.Command("sh", "-c", cmd).CombinedOutput()
			output = strings.TrimSpace(string(out))
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "certbot_failed", err.Error(), fiber.Map{"output": output, "command": cmd})
			}
		}
		return response.OK(c, fiber.Map{
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"command":           cmd,
			"output":            output,
		})
	}
}
