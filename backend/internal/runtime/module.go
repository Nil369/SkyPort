package runtime

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/capabilities"
	"skyport/internal/response"
	"skyport/internal/runtime/installers"
	"skyport/internal/security"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "runtime" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/runtime")
	r.Use(auth.RequireJWT(a.Config.JWTSecret))
	r.Post("/detect", detectHandler(a))
	r.Post("/install", installHandler())
	r.Post("/install/smart", smartInstallHandler(a))
	r.Post("/pm2/startup", pm2StartupHandler())
	return nil
}

type detectRequest struct {
	ProjectPath string `json:"project_path" validate:"required,max=2048"`
}

// @Summary Detect runtime
// @Tags Runtime
// @Security BearerAuth
// @Accept json
// @Produce json
// @Description Scans recursively under project_path (skipped: node_modules, .git, etc.) for manifests and Docker files.
// @Param request body detectRequest true "Detection input"
// @Success 200 {object} DetectionResult
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/runtime/detect [post]
func detectHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req detectRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		p, err := resolveProjectPath(a.Config.WorkspaceRoot, req.ProjectPath)
		if err != nil {
			return response.BadRequest(c, "invalid project path")
		}
		d := NewDetector()
		out, err := d.Detect(p)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "runtime_detect_failed", err.Error())
		}
		return response.OK(c, out)
	}
}

// installRequest: If the runtime binary is already on PATH, installers are never run (skipped_install=true).
//
// Rules: dry_run=true → never executes host installers (preview commands only). If dry_run and execute are both true, dry_run wins.
//
// Typical install: {"runtime":"node","dry_run":false,"execute":true}
type installRequest struct {
	Runtime string `json:"runtime" validate:"required,oneof=node bun python go php java pm2"`
	DryRun  bool   `json:"dry_run"`
	Execute bool   `json:"execute"`
}

type smartInstallRequest struct {
	ProjectPath string `json:"project_path" validate:"required,max=2048"`
	DryRun      bool   `json:"dry_run"`
	Execute     bool   `json:"execute"`
}

// @Summary Smart runtime install
// @Tags Runtime
// @Security BearerAuth
// @Accept json
// @Produce json
// @Description Detects runtime under project_path and installs the minimal recommended runtimes (node + pm2 on low RAM hosts).
// @Param request body smartInstallRequest true "Smart install input"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/runtime/install/smart [post]
func smartInstallHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req smartInstallRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		p, err := resolveProjectPath(a.Config.WorkspaceRoot, req.ProjectPath)
		if err != nil {
			return response.BadRequest(c, "invalid project path")
		}
		det, err := NewDetector().Detect(p)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "runtime_detect_failed", err.Error())
		}
		cap := capabilities.Detect(c.UserContext())
		effectiveExecute := req.Execute && !req.DryRun

		results := []installers.Result{}
		if det.Runtime == Compose || det.Runtime == Docker {
			cmd, notes := dockerInstallHint()
			return response.OK(c, fiber.Map{
				"runtime":           det.Runtime,
				"recommendation":    cap.Recommendation,
				"dry_run":           req.DryRun,
				"execute":           req.Execute,
				"effective_execute": effectiveExecute,
				"requires_docker":   true,
				"install_command":   cmd,
				"install_notes":     notes,
				"results":           results,
			})
		}
		// Install primary runtime
		if det.Runtime != Unknown {
			res, err := installers.Install(c.UserContext(), installers.Request{
				Runtime: strings.ToLower(string(det.Runtime)),
				DryRun:  !effectiveExecute,
				Execute: effectiveExecute,
			})
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "runtime_install_failed", err.Error(), fiber.Map{"result": res})
			}
			results = append(results, res)
		}
		// Low-RAM: prefer pm2 for node runtimes
		if strings.ToLower(string(det.Runtime)) == "node" && cap.Recommendation == "pm2" {
			res, err := installers.Install(c.UserContext(), installers.Request{
				Runtime: "pm2",
				DryRun:  !effectiveExecute,
				Execute: effectiveExecute,
			})
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "runtime_install_failed", err.Error(), fiber.Map{"result": res})
			}
			results = append(results, res)
		}

		return response.OK(c, fiber.Map{
			"runtime":           det.Runtime,
			"recommendation":    cap.Recommendation,
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"results":           results,
		})
	}
}

func dockerInstallHint() (string, string) {
	switch goruntime.GOOS {
	case "linux":
		return "curl -fsSL https://get.docker.com | sh", "Run with sudo/root; then enable with: systemctl enable --now docker"
	case "darwin":
		return "brew install --cask docker", "Start Docker Desktop after install."
	case "windows":
		return "winget install -e --id Docker.DockerDesktop", "Requires admin privileges and reboot in some environments."
	default:
		return "", "Unsupported OS for automated Docker install command."
	}
}

func resolveProjectPath(root, input string) (string, error) {
	clean := filepath.Clean(strings.ReplaceAll(strings.TrimSpace(input), `\`, `/`))
	if clean == "" {
		return "", fmt.Errorf("empty path")
	}
	clean = strings.TrimPrefix(clean, "./")
	clean = strings.TrimPrefix(clean, ".\\")
	base := filepath.Base(root)
	baseLower := strings.ToLower(base)
	cleanLower := strings.ToLower(clean)
	if cleanLower == baseLower {
		clean = ""
	} else if strings.HasPrefix(cleanLower, baseLower+"/") {
		clean = clean[len(base)+1:]
	}
	if !filepath.IsAbs(filepath.FromSlash(clean)) {
		clean = filepath.Join(root, filepath.FromSlash(clean))
	}
	return security.EnsureWithinRoot(root, clean)
}

type pm2StartupRequest struct {
	User    string `json:"user" validate:"omitempty,max=120"`
	Home    string `json:"home" validate:"omitempty,max=2048"`
	DryRun  bool   `json:"dry_run"`
	Execute bool   `json:"execute"`
}

// @Summary PM2 startup helper
// @Tags Runtime
// @Security BearerAuth
// @Accept json
// @Produce json
// @Description Generates or executes pm2 startup command for host reboot persistence.
// @Param request body pm2StartupRequest true "PM2 startup input"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/runtime/pm2/startup [post]
func pm2StartupHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req pm2StartupRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		if goruntime.GOOS != "linux" {
			return response.Error(c, fiber.StatusBadRequest, "unsupported_os", "pm2 startup helper is only supported on Linux")
		}
		user := strings.TrimSpace(req.User)
		if user == "" {
			user = strings.TrimSpace(os.Getenv("SUDO_USER"))
		}
		if user == "" {
			user = strings.TrimSpace(os.Getenv("USER"))
		}
		if user == "" {
			user = strings.TrimSpace(os.Getenv("USERNAME"))
		}
		home := strings.TrimSpace(req.Home)
		if home == "" {
			home = strings.TrimSpace(os.Getenv("HOME"))
		}
		if home == "" {
			home = strings.TrimSpace(os.Getenv("USERPROFILE"))
		}
		cmd := []string{"pm2", "startup", "systemd"}
		if user != "" {
			cmd = append(cmd, "-u", user)
		}
		if home != "" {
			cmd = append(cmd, "--hp", home)
		}
		commandStr := strings.Join(cmd, " ")
		effectiveExecute := req.Execute && !req.DryRun
		output := ""
		if effectiveExecute {
			out, err := exec.Command(cmd[0], cmd[1:]...).CombinedOutput()
			output = strings.TrimSpace(string(out))
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "pm2_startup_failed", err.Error(), fiber.Map{"output": output, "command": commandStr})
			}
		}
		return response.OK(c, fiber.Map{
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"command":           commandStr,
			"output":            output,
		})
	}
}

// @Summary Ensure / install runtime
// @Tags Runtime
// @Security BearerAuth
// @Accept json
// @Produce json
// @Description Checks PATH first; skips install when already present. See installRequest rules for dry_run vs execute.
// @Param request body installRequest true "Install input — use {\"dry_run\":false,\"execute\":true} to install when missing"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/runtime/install [post]
func installHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req installRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		rt := strings.TrimSpace(req.Runtime)
		effectiveExecute := req.Execute && !req.DryRun
		binPath, onPath := installers.LookPathRuntime(rt)
		baseRes := installers.Result{Runtime: rt, Commands: installers.CommandsFor(rt)}

		payload := fiber.Map{
			"dry_run":                   req.DryRun,
			"execute":                   req.Execute,
			"effective_execute":         effectiveExecute,
			"dry_run_overrides_execute": req.DryRun && req.Execute,
			"result":                    baseRes,
		}

		if onPath {
			payload["present"] = true
			payload["found_in"] = binPath
			payload["skipped_install"] = true
			payload["message"] = "runtime already on PATH — installers were not run"
			return response.OK(c, payload)
		}

		payload["present"] = false
		payload["found_in"] = ""
		payload["skipped_install"] = false

		res, err := installers.Install(c.UserContext(), installers.Request{
			Runtime: rt,
			DryRun:  !effectiveExecute,
			Execute: effectiveExecute,
		})
		if err != nil {
			payload["result"] = res
			return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "runtime_install_failed", err.Error(), payload)
		}
		payload["result"] = res
		pathAfter, onPathAfter := installers.LookPathRuntime(rt)
		payload["present"] = onPathAfter
		payload["found_in"] = pathAfter

		switch {
		case req.DryRun && req.Execute:
			payload["message"] = "dry_run is true — execute was ignored; only preview commands are returned"
		case !effectiveExecute && !onPathAfter:
			payload["message"] = "preview only — set {\"dry_run\":false,\"execute\":true} to run installers when runtime is missing"
		case effectiveExecute && onPathAfter:
			payload["message"] = "installation completed"
		case effectiveExecute && !onPathAfter:
			payload["message"] = "install ran but runtime still not detected on PATH (check output in result.output)"
		default:
			payload["message"] = ""
		}
		return response.OK(c, payload)
	}
}
