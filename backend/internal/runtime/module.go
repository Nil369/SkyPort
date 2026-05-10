package runtime

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
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
		p, err := security.EnsureWithinRoot(a.Config.WorkspaceRoot, req.ProjectPath)
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
	Runtime string `json:"runtime" validate:"required,oneof=node bun python go php java"`
	DryRun  bool   `json:"dry_run"`
	Execute bool   `json:"execute"`
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
