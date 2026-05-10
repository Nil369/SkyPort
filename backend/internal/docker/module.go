package docker

import (
	"context"
	"encoding/json"
	"errors"
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
	a.Fiber.Post("/api/v1/docker/install", dockerInstallHandler())
	a.Fiber.Post("/api/v1/docker/start", dockerStartHandler())
	a.Fiber.Post("/api/v1/docker/stop", dockerStopHandler())
	a.Fiber.Post("/api/v1/docker/daemon", dockerDaemonHandler())
	a.Fiber.Get("/api/v1/docker/containers", listContainersHandler())
	a.Fiber.Get("/api/v1/docker/images", listImagesHandler())
	a.Fiber.Delete("/api/v1/docker/image/:name", imageDeleteHandler())
	a.Fiber.Post("/api/v1/docker/images/prune", imagesPruneHandler())
	a.Fiber.Get("/api/v1/docker/volumes", listVolumesHandler())
	a.Fiber.Delete("/api/v1/docker/volume/:name", volumeDeleteHandler())
	a.Fiber.Post("/api/v1/docker/volumes/prune", volumesPruneHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/start", containerStartHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/stop", containerStopHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/restart", containerRestartHandler())
	a.Fiber.Delete("/api/v1/docker/container/:name", containerDeleteHandler())
	return nil
}

func dockerCmd(ctx context.Context, args ...string) (*exec.Cmd, error) {
	bin := resolveDockerBinary()
	if bin == "" {
		return nil, errors.New("docker binary not found in PATH or common install locations")
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = withSanePath(os.Environ())
	return cmd, nil
}

func runDocker(ctx context.Context, args ...string) ([]byte, error) {
	cmd, err := dockerCmd(ctx, args...)
	if err != nil {
		return nil, err
	}
	out, runErr := cmd.CombinedOutput()
	if runErr != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = runErr.Error()
		}
		return nil, errors.New(msg)
	}
	return out, nil
}

func resolveDockerBinary() string {
	if p, err := exec.LookPath("docker"); err == nil {
		return p
	}
	candidates := []string{
		`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
		`C:\ProgramData\DockerDesktop\version-bin\docker.exe`,
		"/usr/bin/docker",
		"/usr/local/bin/docker",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func withSanePath(env []string) []string {
	hasPath := false
	for i := range env {
		if strings.HasPrefix(strings.ToUpper(env[i]), "PATH=") {
			hasPath = true
			break
		}
	}
	if hasPath {
		return env
	}
	if runtime.GOOS == "windows" {
		return append(env, `PATH=C:\Windows\System32;C:\Program Files\Docker\Docker\resources\bin`)
	}
	return append(env, "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
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
		installed := lookErr == nil || resolveDockerBinary() != ""
		daemon := false
		version := ""

		if installed {
			ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
			defer cancel()

			if cmd, err := dockerCmd(ctx, "info"); err == nil {
				daemon = cmd.Run() == nil
			}
			if cmd, err := dockerCmd(ctx, "version", "--format", "{{.Server.Version}}"); err == nil {
				if output, runErr := cmd.Output(); runErr == nil {
					version = strings.TrimSpace(string(output))
				}
			}
		}

		return response.OK(c, fiber.Map{
			"installed":      installed,
			"daemon_running": daemon,
			"version":        version,
		})
	}
}

// dockerInstallHandler returns OS-specific install guidance/command for Docker.
// @Summary Docker install helper
// @Tags Docker
// @Description Detects host OS and returns recommended Docker install command
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/install [post]
func dockerInstallHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		osName := runtime.GOOS
		command := ""
		notes := ""
		switch osName {
		case "linux":
			command = "curl -fsSL https://get.docker.com | sh"
			notes = "Run with sudo/root; then enable with: systemctl enable --now docker"
		case "darwin":
			command = "brew install --cask docker"
			notes = "Start Docker Desktop after install."
		case "windows":
			command = "winget install -e --id Docker.DockerDesktop"
			notes = "Requires admin privileges and reboot in some environments."
		default:
			notes = "Unsupported OS for automated Docker install command."
		}
		return response.OK(c, fiber.Map{
			"os":      osName,
			"install": command,
			"notes":   notes,
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
		ctx, cancel := context.WithTimeout(c.UserContext(), 20*time.Second)
		defer cancel()

		statusCtx, statusCancel := context.WithTimeout(c.UserContext(), 4*time.Second)
		defer statusCancel()
		if cmd, err := dockerCmd(statusCtx, "info"); err == nil && cmd.Run() == nil {
			return response.OK(c, fiber.Map{"status": "docker daemon already running"})
		}

		// Try different ways to start Docker based on OS
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.CommandContext(ctx, "open", "-a", "Docker")
		} else if runtime.GOOS == "windows" {
			if _, err := exec.LookPath("sc"); err == nil {
				cmd = exec.CommandContext(ctx, "sc", "start", "com.docker.service")
			} else {
				cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", "Start-Process -FilePath 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'")
			}
		} else {
			if _, err := exec.LookPath("systemctl"); err == nil {
				cmd = exec.CommandContext(ctx, "systemctl", "start", "docker")
			} else {
				cmd = exec.CommandContext(ctx, "service", "docker", "start")
			}
		}

		if err := cmd.Run(); err != nil {
			if runtime.GOOS == "windows" {
				// Fallback for Windows when service start returns access denied (exit 5).
				_ = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", "Start-Process -FilePath 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'").Run()
			} else {
				return response.Error(c, fiber.StatusInternalServerError, "start_failed", err.Error())
			}
		}

		// Docker Desktop may take longer to initialize.
		deadline := time.Now().Add(30 * time.Second)
		for time.Now().Before(deadline) {
			verifyCtx, verifyCancel := context.WithTimeout(c.UserContext(), 4*time.Second)
			verifyCmd, err := dockerCmd(verifyCtx, "info")
			runOK := err == nil && verifyCmd.Run() == nil
			verifyCancel()
			if runOK {
				return response.OK(c, fiber.Map{"status": "docker daemon started"})
			}
			time.Sleep(2 * time.Second)
		}
		return response.Error(c, fiber.StatusInternalServerError, "start_verification_failed", "daemon start attempted but not ready; if on Windows run server as Administrator and ensure Docker Desktop is installed")
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
		statusCtx, statusCancel := context.WithTimeout(c.UserContext(), 4*time.Second)
		defer statusCancel()
		if cmd, err := dockerCmd(statusCtx, "info"); err != nil || cmd.Run() != nil {
			return response.OK(c, fiber.Map{"status": "docker daemon already stopped"})
		}

		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()

		var cmd *exec.Cmd

		if runtime.GOOS == "darwin" {
			// macOS - try to kill Docker.app
			cmd = exec.CommandContext(ctx, "pkill", "-f", "Docker")
		} else if runtime.GOOS == "windows" {
			cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", "$ErrorActionPreference='SilentlyContinue'; Get-Process -Name 'Docker Desktop','com.docker.backend','vpnkit' | Stop-Process -Force; taskkill /F /IM \"Docker Desktop.exe\" | Out-Null; if (Get-Command sc -ErrorAction SilentlyContinue) { sc stop com.docker.service | Out-Null }")
		} else {
			// Linux
			if _, err := exec.LookPath("systemctl"); err == nil {
				cmd = exec.CommandContext(ctx, "systemctl", "stop", "docker")
			} else {
				cmd = exec.CommandContext(ctx, "service", "docker", "stop")
			}
		}

		if err := cmd.Run(); err != nil && runtime.GOOS != "windows" {
			return response.Error(c, fiber.StatusInternalServerError, "stop_failed", err.Error())
		}

		deadline := time.Now().Add(20 * time.Second)
		for time.Now().Before(deadline) {
			verifyCtx, verifyCancel := context.WithTimeout(c.UserContext(), 3*time.Second)
			vcmd, err := dockerCmd(verifyCtx, "info")
			running := err == nil && vcmd.Run() == nil
			verifyCancel()
			if !running {
				return response.OK(c, fiber.Map{"status": "docker daemon stopped", "stopped": true})
			}
			time.Sleep(1500 * time.Millisecond)
		}
		return response.OK(c, fiber.Map{
			"status":  "stop attempted",
			"stopped": false,
			"message": "docker daemon still running; likely requires elevated permissions or host policy",
		})
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

		action := strings.ToLower(req.Action)
		switch action {
		case "start":
			return dockerStartHandler()(c)
		case "stop":
			return dockerStopHandler()(c)
		case "restart":
			_ = dockerStopHandler()(c)
			return dockerStartHandler()(c)
		}
		return response.BadRequest(c, "invalid action")
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

		output, err := runDocker(ctx, "ps", "-a", "--format", "{{json .}}")
		if err != nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "list_failed", err.Error())
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

		if _, err := runDocker(ctx, "start", name); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such container") {
				return response.Error(c, fiber.StatusNotFound, "container_not_found", err.Error())
			}
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

		if _, err := runDocker(ctx, "stop", name); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such container") {
				return response.Error(c, fiber.StatusNotFound, "container_not_found", err.Error())
			}
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

		if _, err := runDocker(ctx, "restart", name); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such container") {
				return response.Error(c, fiber.StatusNotFound, "container_not_found", err.Error())
			}
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

		if _, err := runDocker(ctx, "rm", "-f", name); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such container") {
				return response.Error(c, fiber.StatusNotFound, "container_not_found", err.Error())
			}
			return response.Error(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "container deleted", "container": name})
	}
}

type imageInfo struct {
	ID      string `json:"id"`
	Repo    string `json:"repository"`
	Tag     string `json:"tag"`
	Size    string `json:"size"`
	Created string `json:"created"`
}

// listImagesHandler lists docker images.
// @Summary List images
// @Tags Docker
// @Description List local Docker images
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/images [get]
func listImagesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()
		output, err := runDocker(ctx, "images", "--format", "{{json .}}")
		if err != nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "images_list_failed", err.Error())
		}
		images := make([]imageInfo, 0)
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			var data map[string]string
			if json.Unmarshal([]byte(line), &data) != nil {
				continue
			}
			images = append(images, imageInfo{
				ID: data["ID"], Repo: data["Repository"], Tag: data["Tag"], Size: data["Size"], Created: data["CreatedSince"],
			})
		}
		return response.OK(c, fiber.Map{"images": images})
	}
}

// imageDeleteHandler removes a docker image by name or ID.
// @Summary Delete image
// @Tags Docker
// @Description Delete a Docker image by name or ID
// @Produce json
// @Param name path string true "Image name or ID"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/image/{name} [delete]
func imageDeleteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()
		if _, err := runDocker(ctx, "rmi", "-f", name); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "image_delete_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "image deleted", "image": name})
	}
}

// imagesPruneHandler removes dangling/unused images.
// @Summary Prune images
// @Tags Docker
// @Description Prune unused Docker images
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/images/prune [post]
func imagesPruneHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 20*time.Second)
		defer cancel()
		out, err := runDocker(ctx, "image", "prune", "-f")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "images_prune_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "images pruned", "output": strings.TrimSpace(string(out))})
	}
}

type volumeInfo struct {
	Name   string `json:"name"`
	Driver string `json:"driver"`
	Scope  string `json:"scope"`
}

// listVolumesHandler lists docker volumes.
// @Summary List volumes
// @Tags Docker
// @Description List local Docker volumes
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/volumes [get]
func listVolumesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Second)
		defer cancel()
		output, err := runDocker(ctx, "volume", "ls", "--format", "{{json .}}")
		if err != nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "volumes_list_failed", err.Error())
		}
		volumes := make([]volumeInfo, 0)
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			var data map[string]string
			if json.Unmarshal([]byte(line), &data) != nil {
				continue
			}
			volumes = append(volumes, volumeInfo{
				Name: data["Name"], Driver: data["Driver"], Scope: data["Scope"],
			})
		}
		return response.OK(c, fiber.Map{"volumes": volumes})
	}
}

// volumeDeleteHandler deletes a docker volume by name.
// @Summary Delete volume
// @Tags Docker
// @Description Delete Docker volume by name
// @Produce json
// @Param name path string true "Volume name"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/volume/{name} [delete]
func volumeDeleteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()
		if _, err := runDocker(ctx, "volume", "rm", name); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "volume_delete_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "volume deleted", "volume": name})
	}
}

// volumesPruneHandler prunes unused docker volumes.
// @Summary Prune volumes
// @Tags Docker
// @Description Prune unused Docker volumes
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/volumes/prune [post]
func volumesPruneHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 20*time.Second)
		defer cancel()
		out, err := runDocker(ctx, "volume", "prune", "-f")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "volumes_prune_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "volumes pruned", "output": strings.TrimSpace(string(out))})
	}
}
