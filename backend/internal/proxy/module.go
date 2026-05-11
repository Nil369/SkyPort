package proxy

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/models"
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
	pr.Get("/mappings", listMappingsHandler(a))
	pr.Post("/mappings", createMappingHandler(a))
	pr.Put("/mappings/:id", updateMappingHandler(a))
	pr.Delete("/mappings/:id", deleteMappingHandler(a))
	pr.Get("/caddy/status", caddyStatusHandler())
	pr.Post("/caddy/install", caddyInstallHandler())
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
	ProjectID *uint  `json:"project_id"`
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

		mapping := models.DomainMapping{
			Domain:    req.Domain,
			Port:      req.Port,
			Type:      t,
			EnableSSL: req.EnableSSL,
			Email:     req.Email,
			ProjectID: req.ProjectID,
		}
		_ = a.DB.Where("domain = ? AND port = ? AND type = ?", req.Domain, req.Port, t).
			Assign(mapping).
			FirstOrCreate(&mapping).Error
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
			"mapping":         mapping,
		})
	}
}

type mappingRequest struct {
	Domain    string `json:"domain" validate:"required,max=255"`
	Port      int    `json:"port" validate:"required,min=1,max=65535"`
	Type      string `json:"type" validate:"omitempty,oneof=caddy nginx"`
	EnableSSL bool   `json:"enable_ssl"`
	Email     string `json:"email" validate:"omitempty,max=255"`
	ProjectID *uint  `json:"project_id"`
}

// @Summary List proxy mappings
// @Tags Proxy
// @Security BearerAuth
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/proxy/mappings [get]
func listMappingsHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var items []models.DomainMapping
		if err := a.DB.Order("created_at desc").Find(&items).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"mappings": items})
	}
}

// @Summary Create proxy mapping
// @Tags Proxy
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body mappingRequest true "Mapping payload"
// @Success 201 {object} models.DomainMapping
// @Router /api/v1/proxy/mappings [post]
func createMappingHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req mappingRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		t := req.Type
		if t == "" {
			t = "caddy"
		}
		item := models.DomainMapping{
			Domain:    req.Domain,
			Port:      req.Port,
			Type:      t,
			EnableSSL: req.EnableSSL,
			Email:     req.Email,
			ProjectID: req.ProjectID,
		}
		if err := a.DB.Create(&item).Error; err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, item)
	}
}

// @Summary Update proxy mapping
// @Tags Proxy
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body mappingRequest true "Mapping payload"
// @Success 200 {object} models.DomainMapping
// @Router /api/v1/proxy/mappings/{id} [put]
func updateMappingHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := c.ParamsInt("id")
		if err != nil || id <= 0 {
			return response.BadRequest(c, "invalid mapping id")
		}
		var req mappingRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		t := req.Type
		if t == "" {
			t = "caddy"
		}
		updates := map[string]any{
			"domain":     req.Domain,
			"port":       req.Port,
			"type":       t,
			"enable_ssl": req.EnableSSL,
			"email":      req.Email,
			"project_id": req.ProjectID,
			"updated_at": time.Now(),
		}
		if err := a.DB.Model(&models.DomainMapping{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		var item models.DomainMapping
		if err := a.DB.First(&item, id).Error; err != nil {
			return err
		}
		return response.OK(c, item)
	}
}

// @Summary Delete proxy mapping
// @Tags Proxy
// @Security BearerAuth
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/proxy/mappings/{id} [delete]
func deleteMappingHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := c.ParamsInt("id")
		if err != nil || id <= 0 {
			return response.BadRequest(c, "invalid mapping id")
		}
		if err := a.DB.Delete(&models.DomainMapping{}, id).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"deleted": true})
	}
}

// @Summary Caddy status
// @Tags Proxy
// @Security BearerAuth
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/proxy/caddy/status [get]
func caddyStatusHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path, err := exec.LookPath("caddy")
		if err != nil && runtime.GOOS == "windows" {
			if p := windowsCaddyLocalBin(); p != "" {
				path = p
				err = nil
			}
		}
		if err != nil {
			return response.OK(c, fiber.Map{"installed": false})
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 3*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, path, "version")
		out, _ := cmd.Output()
		return response.OK(c, fiber.Map{
			"installed": true,
			"path":      path,
			"version":   strings.TrimSpace(string(out)),
		})
	}
}

type caddyInstallRequest struct {
	Execute bool `json:"execute"`
}

// @Summary Install Caddy
// @Tags Proxy
// @Security BearerAuth
// @Accept json
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/proxy/caddy/install [post]
func caddyInstallHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req caddyInstallRequest
		_ = c.BodyParser(&req)
		osName := runtime.GOOS
		command := ""
		notes := ""
		installer := ""
		switch osName {
		case "windows":
			command, notes, installer = windowsCaddyInstallCommand()
		case "darwin":
			command = "brew install caddy"
			notes = "Ensure Homebrew is installed."
			installer = "brew"
		default:
			command = "sudo apt-get update && sudo apt-get install -y caddy"
			notes = "For non-Debian distros, use the Caddy docs."
			installer = "apt"
		}

		if !req.Execute {
			return response.OK(c, fiber.Map{
				"os":              osName,
				"install_command": command,
				"notes":           notes,
				"installer":       installer,
				"executed":        false,
			})
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 3*time.Minute)
		defer cancel()
		var run *exec.Cmd
		if osName == "windows" {
			run = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
		} else {
			run = exec.CommandContext(ctx, "sh", "-c", command)
		}
		out, err := run.CombinedOutput()
		if err != nil {
			if osName == "windows" {
				fallbackCmd, fallbackInstaller := windowsCaddyFallback(command, string(out))
				if fallbackCmd != "" {
					fbRun := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", fallbackCmd)
					fbOut, fbErr := fbRun.CombinedOutput()
					if fbErr == nil {
						return response.OK(c, fiber.Map{
							"os":              osName,
							"install_command": fallbackCmd,
							"notes":           notes,
							"installer":       fallbackInstaller,
							"executed":        true,
							"output":          strings.TrimSpace(string(fbOut)),
						})
					}
				}
				if fbOut, fbErr := windowsCaddyPortableInstall(ctx); fbErr == nil {
					return response.OK(c, fiber.Map{
						"os":              osName,
						"install_command": "portable",
						"notes":           "Installed to a local user bin. Restart the SkyPort server to pick up PATH.",
						"installer":       "portable",
						"executed":        true,
						"output":          strings.TrimSpace(string(fbOut)),
					})
				}
			}
			return response.Error(c, fiber.StatusInternalServerError, "caddy_install_failed", strings.TrimSpace(string(out)))
		}
		return response.OK(c, fiber.Map{
			"os":              osName,
			"install_command": command,
			"notes":           notes,
			"installer":       installer,
			"executed":        true,
			"output":          strings.TrimSpace(string(out)),
		})
	}
}

func windowsCaddyInstallCommand() (string, string, string) {
	if _, err := exec.LookPath("winget"); err == nil {
		cmd := "winget source update --name winget; winget install -e --id Caddy.Caddy --source winget --accept-source-agreements --accept-package-agreements"
		return cmd, "Requires admin privileges.", "winget"
	}
	if _, err := exec.LookPath("choco"); err == nil {
		return "choco install caddy -y", "Requires admin privileges.", "choco"
	}
	if _, err := exec.LookPath("scoop"); err == nil {
		return "scoop install caddy", "Ensure Scoop is installed for the current user.", "scoop"
	}
	return "winget install -e --id Caddy.Caddy --source winget --accept-source-agreements --accept-package-agreements", "Install a package manager first (winget, choco, or scoop).", ""
}

func windowsCaddyFallback(primaryCmd, output string) (string, string) {
	out := strings.ToLower(output)
	if strings.Contains(out, "no package found") || strings.Contains(out, "0x8a150042") {
		if _, err := exec.LookPath("choco"); err == nil {
			return "choco install caddy -y", "choco"
		}
		if _, err := exec.LookPath("scoop"); err == nil {
			return "scoop install caddy", "scoop"
		}
	}
	_ = primaryCmd
	return "", ""
}

func windowsCaddyLocalBin() string {
	local := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if local == "" {
		if home, err := os.UserHomeDir(); err == nil {
			local = filepath.Join(home, "AppData", "Local")
		}
	}
	if local == "" {
		return ""
	}
	path := filepath.Join(local, "SkyPort", "bin", "caddy.exe")
	if _, err := os.Stat(path); err == nil {
		return path
	}
	return ""
}

func windowsCaddyPortableInstall(ctx context.Context) ([]byte, error) {
	local := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if local == "" {
		if home, err := os.UserHomeDir(); err == nil {
			local = filepath.Join(home, "AppData", "Local")
		}
	}
	if local == "" {
		return nil, fmt.Errorf("LOCALAPPDATA not found")
	}
	dest := filepath.Join(local, "SkyPort", "bin")
	ps := fmt.Sprintf(`$ErrorActionPreference='Stop';
$dest='%s';
New-Item -ItemType Directory -Force -Path $dest | Out-Null;
$zip=Join-Path $env:TEMP 'caddy.zip';
Invoke-WebRequest -Uri 'https://github.com/caddyserver/caddy/releases/latest/download/caddy_windows_amd64.zip' -OutFile $zip;
Expand-Archive -Path $zip -DestinationPath $dest -Force;
$bin=Join-Path $dest 'caddy.exe';
if (!(Test-Path $bin)) { throw 'caddy.exe not found after extract' };
$userPath=[Environment]::GetEnvironmentVariable('Path','User');
if ($userPath -notlike '*'+$dest+'*') { [Environment]::SetEnvironmentVariable('Path', $userPath + ';' + $dest, 'User') };
Write-Output $bin;`, dest)
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", ps)
	return cmd.CombinedOutput()
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
