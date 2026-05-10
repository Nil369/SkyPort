package system

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"

	"skyport/internal/app"
	"skyport/internal/response"
)

type Module struct{}

func (m *Module) Name() string { return "system" }

func (m *Module) Register(a *app.App) error {
	a.Fiber.Get("/api/v1/system/info", systemInfoHandler())
	a.Fiber.Get("/api/v1/system/git/status", gitStatusHandler())
	a.Fiber.Post("/api/v1/system/git/install", gitInstallHandler())
	return nil
}

// systemInfoHandler returns host and runtime information.
// @Summary System info
// @Tags System
// @Description Returns host and runtime information (OS, memory, cpu, uptime)
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/system/info [get]
func systemInfoHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		h, _ := host.Info()
		vm, _ := mem.VirtualMemory()
		return response.OK(c, fiber.Map{
			"hostname":     h.Hostname,
			"architecture": runtime.GOARCH,
			"os":           runtime.GOOS,
			"uptime":       h.Uptime,
			"go_version":   runtime.Version(),
			"cpu_cores":    runtime.NumCPU(),
			"memory": fiber.Map{
				"total_bytes": vm.Total,
				"used_bytes":  vm.Used,
				"free_bytes":  vm.Free,
			},
		})
	}
}

// gitStatusHandler checks whether git is available and returns version.
// @Summary Git status
// @Tags System
// @Description Returns whether git is installed and its version
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/system/git/status [get]
func gitStatusHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path, err := exec.LookPath("git")
		if err != nil {
			return response.OK(c, fiber.Map{"installed": false})
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 3*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, path, "--version")
		out, _ := cmd.Output()
		return response.OK(c, fiber.Map{
			"installed": true,
			"path":      path,
			"version":   strings.TrimSpace(string(out)),
		})
	}
}

type gitInstallRequest struct {
	Execute bool `json:"execute"`
}

// gitInstallHandler provides/install git based on host OS.
// @Summary Install git
// @Tags System
// @Description Returns OS-specific git install command and optionally executes it when execute=true
// @Accept json
// @Produce json
// @Param request body gitInstallRequest false "Install request"
// @Success 200 {object} map[string]any
// @Failure 500 {object} response.ErrorBody
// @Router /api/v1/system/git/install [post]
func gitInstallHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req gitInstallRequest
		_ = c.BodyParser(&req)

		cmd := ""
		linuxCmd := ""
		switch runtime.GOOS {
		case "windows":
			cmd = "winget install --id Git.Git -e"
		case "darwin":
			cmd = "brew install git"
		default:
			linuxCmd = "(command -v apt-get >/dev/null && apt-get update && apt-get install -y git) || (command -v dnf >/dev/null && dnf install -y git) || (command -v yum >/dev/null && yum install -y git) || (command -v pacman >/dev/null && pacman -Sy --noconfirm git)"
			cmd = "sh -c \"" + linuxCmd + "\""
		}

		if !req.Execute {
			return response.OK(c, fiber.Map{"os": runtime.GOOS, "install_command": cmd, "executed": false})
		}

		ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Minute)
		defer cancel()
		var run *exec.Cmd
		if runtime.GOOS == "windows" {
			run = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", cmd)
		} else {
			run = exec.CommandContext(ctx, "sh", "-c", linuxCmd)
		}
		out, err := run.CombinedOutput()
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "git_install_failed", strings.TrimSpace(string(out)))
		}
		return response.OK(c, fiber.Map{"executed": true, "output": strings.TrimSpace(string(out))})
	}
}
