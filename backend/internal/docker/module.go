package docker

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "docker" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableDocker {
		return nil
	}
	a.Fiber.Get("/api/v1/docker/status", dockerStatusHandler())
	a.Fiber.Post("/api/v1/docker/start", dockerStartHandler())
	a.Fiber.Post("/api/v1/docker/stop", dockerStopHandler())
	a.Fiber.Post("/api/v1/docker/daemon", dockerDaemonHandler())
	a.Fiber.Get("/api/v1/docker/containers", listContainersHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/start", containerStartHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/stop", containerStopHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/restart", containerRestartHandler())
	a.Fiber.Delete("/api/v1/docker/container/:name", containerDeleteHandler())
	return nil
}

// dockerStatusHandler reports local Docker availability.
// @Summary Docker status
// @Tags Docker
// @Description Returns whether Docker is installed and daemon status
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/status [get]
func dockerStatusHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		_, lookErr := exec.LookPath("docker")
		installed := lookErr == nil
		daemon := false
		version := ""

		if installed {
			ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
			defer cancel()

			// Check daemon status
			cmd := exec.CommandContext(ctx, "docker", "info")
			daemon = cmd.Run() == nil

			// Get Docker version
			versionCmd := exec.CommandContext(ctx, "docker", "version", "--format", "{{.Server.Version}}")
			if output, err := versionCmd.Output(); err == nil {
				version = strings.TrimSpace(string(output))
			}
		}

		return response.OK(c, fiber.Map{
			"installed":      installed,
			"daemon_running": daemon,
			"version":        version,
		})
	}
}

// dockerStartHandler starts the Docker daemon (Linux/Docker Desktop).
// @Summary Start Docker daemon
// @Tags Docker
// @Description Start the Docker daemon
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/start [post]
func dockerStartHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()

		var cmd *exec.Cmd

		// Ensure PATH exists (some environments may not have it set)
		if os.Getenv("PATH") == "" {
			if runtime.GOOS == "windows" {
				_ = os.Setenv("PATH", `C:\\Windows\\System32`)
			} else {
				_ = os.Setenv("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
			}
		}

		// Try different ways to start Docker based on OS
		if runtime.GOOS == "darwin" {
			// macOS - try opening Docker.app
			cmd = exec.CommandContext(ctx, "open", "-a", "Docker")
		} else if runtime.GOOS == "windows" {
			// Windows - try starting Docker service, fallback to starting Docker Desktop executable
			if _, err := exec.LookPath("sc"); err == nil {
				cmd = exec.CommandContext(ctx, "sc", "start", "com.docker.service")
			} else {
				// Best-effort: try to start Docker Desktop executable
				cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", "Start-Process -FilePath 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe' -ErrorAction SilentlyContinue")
			}
		} else {
			// Linux - use systemctl or service
			if _, err := exec.LookPath("systemctl"); err == nil {
				cmd = exec.CommandContext(ctx, "systemctl", "start", "docker")
			} else {
				cmd = exec.CommandContext(ctx, "service", "docker", "start")
			}
		}

		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "start_failed", err.Error())
		}

		// Give daemon time to start
		time.Sleep(2 * time.Second)

		// Verify it started
		verifyCmd := exec.CommandContext(ctx, "docker", "info")
		if err := verifyCmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "start_verification_failed", "daemon started but not responding")
		}

		return response.OK(c, fiber.Map{"status": "docker daemon started"})
	}
}

// dockerStopHandler stops the Docker daemon.
// @Summary Stop Docker daemon
// @Tags Docker
// @Description Stop the Docker daemon
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/stop [post]
func dockerStopHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()

		var cmd *exec.Cmd

		// Ensure PATH exists
		if os.Getenv("PATH") == "" {
			if runtime.GOOS == "windows" {
				_ = os.Setenv("PATH", `C:\\Windows\\System32`)
			} else {
				_ = os.Setenv("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
			}
		}

		if runtime.GOOS == "darwin" {
			// macOS - try to kill Docker.app
			cmd = exec.CommandContext(ctx, "pkill", "-f", "Docker")
		} else if runtime.GOOS == "windows" {
			// Windows - try stopping Docker service
			if _, err := exec.LookPath("sc"); err == nil {
				cmd = exec.CommandContext(ctx, "sc", "stop", "com.docker.service")
			} else {
				cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", "Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force")
			}
		} else {
			// Linux
			if _, err := exec.LookPath("systemctl"); err == nil {
				cmd = exec.CommandContext(ctx, "systemctl", "stop", "docker")
			} else {
				cmd = exec.CommandContext(ctx, "service", "docker", "stop")
			}
		}

		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "stop_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "docker daemon stopped"})
	}
}

type daemonRequest struct {
	Action string `json:"action" validate:"required,oneof=start stop restart"`
}

// dockerDaemonHandler controls Docker daemon (start/stop/restart).
// @Summary Control Docker daemon
// @Tags Docker
// @Description Start, stop, or restart the Docker daemon
// @Accept json
// @Produce json
// @Param request body daemonRequest true "Daemon control request"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/daemon [post]
func dockerDaemonHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req daemonRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		ctx, cancel := context.WithTimeout(c.UserContext(), 15*time.Second)
		defer cancel()

		action := strings.ToLower(req.Action)

		if action == "restart" {
			// Stop first
			stopCmd := exec.CommandContext(ctx, "systemctl", "restart", "docker")
			if exec.Command("which", "systemctl").Run() != nil {
				stopCmd = exec.CommandContext(ctx, "service", "docker", "restart")
			}
			if err := stopCmd.Run(); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "restart_failed", err.Error())
			}
		} else {
			var cmd *exec.Cmd
			if action == "start" {
				cmd = exec.CommandContext(ctx, "systemctl", "start", "docker")
				if exec.Command("which", "systemctl").Run() != nil {
					cmd = exec.CommandContext(ctx, "service", "docker", "start")
				}
			} else {
				cmd = exec.CommandContext(ctx, "systemctl", "stop", "docker")
				if exec.Command("which", "systemctl").Run() != nil {
					cmd = exec.CommandContext(ctx, "service", "docker", "stop")
				}
			}

			if err := cmd.Run(); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, action+"_failed", err.Error())
			}
		}

		return response.OK(c, fiber.Map{"status": "docker daemon " + action + "ed"})
	}
}

// containerInfo represents Docker container information
type containerInfo struct {
	ID      string `json:"id"`
	Names   string `json:"names"`
	Image   string `json:"image"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
	State   string `json:"state"`
	Created string `json:"created"`
}

// listContainersHandler lists all Docker containers.
// @Summary List containers
// @Tags Docker
// @Description List all Docker containers (running and stopped)
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/containers [get]
func listContainersHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", "ps", "-a", "--format", "{{json .}}")
		output, err := cmd.Output()
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "list_failed", "failed to list containers")
		}

		containers := make([]containerInfo, 0)
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")

		for _, line := range lines {
			if line == "" {
				continue
			}
			var data map[string]string
			if err := json.Unmarshal([]byte(line), &data); err != nil {
				continue
			}

			containers = append(containers, containerInfo{
				ID:      data["ID"],
				Names:   data["Names"],
				Image:   data["Image"],
				Status:  data["Status"],
				Ports:   data["Ports"],
				State:   data["State"],
				Created: data["CreatedAt"],
			})
		}

		return response.OK(c, fiber.Map{"containers": containers})
	}
}

// containerStartHandler starts a Docker container.
// @Summary Start container
// @Tags Docker
// @Description Start a Docker container by name or ID
// @Produce json
// @Param name path string true "Container name or ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/container/{name}/start [post]
func containerStartHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")

		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", "start", name)
		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "start_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "container started", "container": name})
	}
}

// containerStopHandler stops a Docker container.
// @Summary Stop container
// @Tags Docker
// @Description Stop a Docker container by name or ID
// @Produce json
// @Param name path string true "Container name or ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/container/{name}/stop [post]
func containerStopHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")

		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", "stop", name)
		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "stop_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "container stopped", "container": name})
	}
}

// containerRestartHandler restarts a Docker container.
// @Summary Restart container
// @Tags Docker
// @Description Restart a Docker container by name or ID
// @Produce json
// @Param name path string true "Container name or ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/container/{name}/restart [post]
func containerRestartHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")

		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", "restart", name)
		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "restart_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "container restarted", "container": name})
	}
}

// containerDeleteHandler removes a Docker container.
// @Summary Delete container
// @Tags Docker
// @Description Remove a Docker container by name or ID
// @Produce json
// @Param name path string true "Container name or ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/container/{name} [delete]
func containerDeleteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")

		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "docker", "rm", "-f", name)
		if err := cmd.Run(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "container deleted", "container": name})
	}
}
