package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
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
	a.Fiber.Get("/api/v1/docker/hub/tags", dockerHubTagsHandler())
	a.Fiber.Post("/api/v1/docker/install", dockerInstallHandler())
	a.Fiber.Post("/api/v1/docker/start", dockerStartHandler())
	a.Fiber.Post("/api/v1/docker/stop", dockerStopHandler())
	a.Fiber.Post("/api/v1/docker/daemon", dockerDaemonHandler())
	a.Fiber.Get("/api/v1/docker/containers", listContainersHandler())
	a.Fiber.Get("/api/v1/docker/images", listImagesHandler())
	a.Fiber.Delete("/api/v1/docker/image/:name", imageDeleteHandler())
	a.Fiber.Post("/api/v1/docker/image/:name/run", imageRunHandler())
	a.Fiber.Get("/api/v1/docker/image/:name/pull/stream", imagePullStreamHandler())
	a.Fiber.Post("/api/v1/docker/images/prune", imagesPruneHandler())
	a.Fiber.Get("/api/v1/docker/hub/repo", dockerHubRepoHandler())
	a.Fiber.Get("/api/v1/docker/volumes", listVolumesHandler())
	a.Fiber.Post("/api/v1/docker/volumes/create", volumeCreateHandler())
	a.Fiber.Delete("/api/v1/docker/volume/:name", volumeDeleteHandler())
	a.Fiber.Post("/api/v1/docker/volumes/prune", volumesPruneHandler())
	a.Fiber.Get("/api/v1/docker/networks", listNetworksHandler())
	a.Fiber.Post("/api/v1/docker/compose/deploy", dockerComposeDeployHandler())
	a.Fiber.Post("/api/v1/docker/networks/prune", networksPruneHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/start", containerStartHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/stop", containerStopHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/restart", containerRestartHandler())
	a.Fiber.Delete("/api/v1/docker/container/:name", containerDeleteHandler())
	a.Fiber.Post("/api/v1/docker/container/:name/commit", containerCommitHandler())
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

func runDockerWithContext(ctx context.Context, contextName string, args ...string) ([]byte, error) {
	name := strings.TrimSpace(contextName)
	if name == "" {
		return runDocker(ctx, args...)
	}
	ctxArgs := append([]string{"--context", name}, args...)
	return runDocker(ctx, ctxArgs...)
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
type dockerInstallRequest struct {
	Execute bool `json:"execute"`
}

func dockerInstallHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req dockerInstallRequest
		_ = c.BodyParser(&req)
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

		if !req.Execute {
			return response.OK(c, fiber.Map{
				"os":       osName,
				"install":  command,
				"notes":    notes,
				"executed": false,
			})
		}

		if command == "" {
			return response.Error(c, fiber.StatusBadRequest, "unsupported_os", "no install command available for this OS")
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
			return response.Error(c, fiber.StatusInternalServerError, "docker_install_failed", strings.TrimSpace(string(out)))
		}
		return response.OK(c, fiber.Map{
			"os":       osName,
			"install":  command,
			"notes":    notes,
			"executed": true,
			"output":   strings.TrimSpace(string(out)),
		})
	}
}

// dockerHubTagsHandler proxies Docker Hub tag lookup to avoid browser CORS restrictions.
// @Summary Docker Hub tags
// @Tags Docker
// @Description Returns a list of tags for a Docker Hub repository
// @Produce json
// @Param image query string true "Repository name, optionally namespace/repo"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/hub/tags [get]
func dockerHubTagsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		image := strings.TrimSpace(c.Query("image"))
		if image == "" {
			return response.Error(c, fiber.StatusBadRequest, "missing_image", "image query parameter is required")
		}

		namespace := "library"
		repo := image
		if parts := strings.SplitN(image, "/", 2); len(parts) == 2 {
			namespace = strings.TrimSpace(parts[0])
			repo = strings.TrimSpace(parts[1])
		}

		if namespace == "" || repo == "" {
			return response.Error(c, fiber.StatusBadRequest, "invalid_image", "image must be in repo or namespace/repo form")
		}

		endpoint := fmt.Sprintf("https://hub.docker.com/v2/repositories/%s/%s/tags?page_size=25", url.PathEscape(namespace), url.PathEscape(repo))
		req, err := http.NewRequestWithContext(c.UserContext(), http.MethodGet, endpoint, nil)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "docker_hub_request_failed", err.Error())
		}
		req.Header.Set("User-Agent", "SkyPort/1.0")

		client := &http.Client{Timeout: 10 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			return response.Error(c, fiber.StatusBadGateway, "docker_hub_unreachable", err.Error())
		}
		defer res.Body.Close()

		var payload struct {
			Results []struct {
				Name string `json:"name"`
			} `json:"results"`
		}
		if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
			return response.Error(c, fiber.StatusBadGateway, "docker_hub_decode_failed", err.Error())
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return response.Error(c, res.StatusCode, "docker_hub_request_failed", "docker hub returned an error")
		}

		tags := make([]string, 0, len(payload.Results))
		for _, item := range payload.Results {
			if name := strings.TrimSpace(item.Name); name != "" {
				tags = append(tags, name)
			}
		}

		return response.OK(c, fiber.Map{
			"image": image,
			"tags":  tags,
		})
	}
}

// dockerHubRepoHandler proxies repository metadata (description/full_description)
// so the frontend can prefill envs and other helpful information.
// @Summary Docker Hub repo
// @Tags Docker
// @Description Return repository metadata for a Docker Hub repository
// @Produce json
// @Param image query string true "Repository name, optionally namespace/repo"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/hub/repo [get]
func dockerHubRepoHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		image := strings.TrimSpace(c.Query("image"))
		if image == "" {
			return response.Error(c, fiber.StatusBadRequest, "missing_image", "image query parameter is required")
		}
		namespace := "library"
		repo := image
		if parts := strings.SplitN(image, "/", 2); len(parts) == 2 {
			namespace = strings.TrimSpace(parts[0])
			repo = strings.TrimSpace(parts[1])
		}
		endpoint := fmt.Sprintf("https://hub.docker.com/v2/repositories/%s/%s/", url.PathEscape(namespace), url.PathEscape(repo))
		req, err := http.NewRequestWithContext(c.UserContext(), http.MethodGet, endpoint, nil)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "docker_hub_request_failed", err.Error())
		}
		req.Header.Set("User-Agent", "SkyPort/1.0")
		client := &http.Client{Timeout: 10 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			return response.Error(c, fiber.StatusBadGateway, "docker_hub_unreachable", err.Error())
		}
		defer res.Body.Close()
		var payload map[string]any
		if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
			return response.Error(c, fiber.StatusBadGateway, "docker_hub_decode_failed", err.Error())
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return response.Error(c, res.StatusCode, "docker_hub_request_failed", "docker hub returned an error")
		}
		return response.OK(c, fiber.Map{"repo": payload})
	}
}

// imagePullStreamHandler streams `docker pull` output as server-sent events.
// Clients can connect with EventSource to receive live pull progress.
func imagePullStreamHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		image := c.Params("name")
		if dec, err := url.PathUnescape(image); err == nil && dec != "" {
			image = dec
		}
		ctx := c.UserContext()

		cmd, err := dockerCmd(ctx, "pull", image)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "docker_not_found", err.Error())
		}

		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		// Start the command
		if err := cmd.Start(); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "pull_start_failed", err.Error())
		}

		// Set SSE headers
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		// Note: fasthttp RequestCtx doesn't expose a Flush method here.
		// We write events directly; the HTTP server will flush as appropriate.

		reader := bufio.NewReader(io.MultiReader(stdout, stderr))
		for {
			line, err := reader.ReadString('\n')
			if line != "" {
				// Send SSE data event
				safe := strings.TrimRight(line, "\r\n")
				_, _ = c.WriteString("data: " + safe + "\n\n")
				// intentionally no explicit flush here; write already sent
			}
			if err != nil {
				if err == io.EOF {
					break
				}
				// non-EOF error: send as final error event and exit
				_, _ = c.WriteString("event: error\ndata: " + err.Error() + "\n\n")
				// intentionally no explicit flush here; write already sent
				break
			}
		}

		// Wait for command to finish
		_ = cmd.Wait()

		// Signal completion
		_, _ = c.WriteString("event: done\ndata: done\n\n")
		// intentionally no explicit flush here; final write completed

		return nil
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

// dockerComposeDeployHandler accepts a docker-compose YAML and runs `docker compose -f <file> up -d`.
// @Summary Deploy docker-compose
// @Tags Docker
// @Accept json
// @Produce json
// @Param request body map[string]string true "Compose payload"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/compose/deploy [post]
func dockerComposeDeployHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Compose     string `json:"compose"`
			ProjectPath string `json:"project_path"`
		}
		if err := c.BodyParser(&body); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "invalid_body", "failed to parse request body")
		}
		compose := strings.TrimSpace(body.Compose)
		if compose == "" {
			return response.Error(c, fiber.StatusBadRequest, "empty_compose", "compose content is required")
		}

		// Write compose content to a temp file
		tmp, err := os.CreateTemp("", "skyport-compose-*.yml")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "tempfile_failed", err.Error())
		}
		tmpPath := tmp.Name()
		defer func() {
			tmp.Close()
			_ = os.Remove(tmpPath)
		}()

		if _, err := tmp.WriteString(compose); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "write_failed", err.Error())
		}

		ctx, cancel := context.WithTimeout(c.UserContext(), 4*time.Minute)
		defer cancel()

		// run `docker compose -f <tmp> up -d`
		cmd, cmdErr := dockerCmd(ctx, "compose", "-f", tmpPath, "up", "-d")
		if cmdErr != nil {
			return response.Error(c, fiber.StatusInternalServerError, "docker_not_found", cmdErr.Error())
		}

		out, runErr := cmd.CombinedOutput()
		if runErr != nil {
			msg := strings.TrimSpace(string(out))
			if msg == "" {
				msg = runErr.Error()
			}
			return response.Error(c, fiber.StatusInternalServerError, "compose_failed", msg)
		}

		return response.OK(c, fiber.Map{"status": "ok", "output": strings.TrimSpace(string(out))})
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
	ID           string `json:"id"`
	Names        string `json:"names"`
	Image        string `json:"image"`
	Status       string `json:"status"`
	Ports        string `json:"ports"`
	State        string `json:"state"`
	Created      string `json:"created"`
	Context      string `json:"context,omitempty"`
	Mounts       string `json:"mounts,omitempty"`
	Networks     string `json:"networks,omitempty"`
	LocalVolumes string `json:"local_volumes,omitempty"`
}

type commitRequest struct {
	Repository string `json:"repository" validate:"required,max=255"`
	Tag        string `json:"tag" validate:"omitempty,max=128"`
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
		ctx, cancel := context.WithTimeout(c.UserContext(), 12*time.Second)
		defer cancel()

		contexts := listDockerContexts(ctx)
		currentContext := strings.TrimSpace(dockerContextShow(ctx))
		if currentContext != "" {
			contexts = append([]string{currentContext}, contexts...)
		}
		if runtime.GOOS == "windows" {
			contexts = append(contexts, "desktop-linux", "desktop-windows")
		}
		contexts = append(contexts, "default")

		seen := map[string]bool{}
		unique := map[string]containerInfo{}
		for _, ctxName := range contexts {
			name := strings.TrimSpace(ctxName)
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			out, err := runDockerWithContext(ctx, name, "ps", "-a", "--format", "{{json .}}")
			if err != nil {
				continue
			}
			parsed := parseDockerContainers(out, name)
			if len(parsed) == 0 {
				fallback, fbErr := runDockerWithContext(ctx, name, "ps", "-a", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.State}}\t{{.CreatedAt}}")
				if fbErr == nil {
					parsed = parseDockerContainersTSV(fallback, name)
				}
			}
			for _, info := range parsed {
				if info.ID == "" {
					continue
				}
				if _, ok := unique[info.ID]; !ok {
					unique[info.ID] = info
				}
			}
		}

		containers := make([]containerInfo, 0, len(unique))
		for _, info := range unique {
			containers = append(containers, info)
		}

		return response.OK(c, fiber.Map{"containers": containers})
	}
}

func parseDockerContainers(output []byte, ctxName string) []containerInfo {
	containers := make([]containerInfo, 0)
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var data map[string]any
		if err := json.Unmarshal([]byte(line), &data); err != nil {
			continue
		}
		containers = append(containers, containerInfo{
			ID:           stringField(data["ID"]),
			Names:        stringField(data["Names"]),
			Image:        stringField(data["Image"]),
			Status:       stringField(data["Status"]),
			Ports:        stringField(data["Ports"]),
			State:        stringField(data["State"]),
			Created:      stringField(data["CreatedAt"]),
			Context:      ctxName,
			Mounts:       stringField(data["Mounts"]),
			Networks:     stringField(data["Networks"]),
			LocalVolumes: stringField(data["LocalVolumes"]),
		})
	}
	return containers
}

func parseDockerContainersTSV(output []byte, ctxName string) []containerInfo {
	containers := make([]containerInfo, 0)
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		info := containerInfo{Context: ctxName}
		info.ID = strings.TrimSpace(parts[0])
		info.Names = strings.TrimSpace(parts[1])
		info.Image = strings.TrimSpace(parts[2])
		if len(parts) > 3 {
			info.Status = strings.TrimSpace(parts[3])
		}
		if len(parts) > 4 {
			info.Ports = strings.TrimSpace(parts[4])
		}
		if len(parts) > 5 {
			info.State = strings.TrimSpace(parts[5])
		}
		if len(parts) > 6 {
			info.Created = strings.TrimSpace(parts[6])
		}
		containers = append(containers, info)
	}
	return containers
}

func listDockerContexts(ctx context.Context) []string {
	out, err := runDocker(ctx, "context", "ls", "--format", "{{.Name}}")
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	contexts := make([]string, 0, len(lines))
	for _, line := range lines {
		name := strings.TrimSpace(line)
		if name != "" {
			contexts = append(contexts, name)
		}
	}
	return contexts
}

func dockerContextShow(ctx context.Context) string {
	out, err := runDocker(ctx, "context", "show")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
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
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}

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
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}

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
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}

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
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}

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

// containerCommitHandler creates a new image from a container.
// @Summary Commit container
// @Tags Docker
// @Description Create a Docker image from a container by name or ID
// @Accept json
// @Produce json
// @Param name path string true "Container name or ID"
// @Param request body commitRequest true "Commit request"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/container/{name}/commit [post]
func containerCommitHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}
		var req commitRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		repo := strings.TrimSpace(req.Repository)
		tag := strings.TrimSpace(req.Tag)
		if tag == "" {
			tag = "latest"
		}
		imageRef := repo + ":" + tag

		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()

		if _, err := runDocker(ctx, "commit", name, imageRef); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such container") {
				return response.Error(c, fiber.StatusNotFound, "container_not_found", err.Error())
			}
			return response.Error(c, fiber.StatusInternalServerError, "commit_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"status": "image created", "image": imageRef})
	}
}

type imageInfo struct {
	ID      string `json:"id"`
	Repo    string `json:"repository"`
	Tag     string `json:"tag"`
	Size    string `json:"size"`
	Created string `json:"created"`
}

type imageRunRequest struct {
	Name string `json:"name" validate:"omitempty,max=128"`
	Port int    `json:"port" validate:"omitempty,min=1,max=65535"`
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
		if dec, err := url.PathUnescape(name); err == nil && dec != "" {
			name = dec
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
		defer cancel()
		if _, err := runDocker(ctx, "rmi", "-f", name); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "image_delete_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "image deleted", "image": name})
	}
}

// imageRunHandler creates a container from an image.
// @Summary Run image
// @Tags Docker
// @Description Run a Docker image to create a container
// @Accept json
// @Produce json
// @Param name path string true "Image name or ID"
// @Param request body imageRunRequest false "Run request"
// @Success 200 {object} map[string]any
// @Router /api/v1/docker/image/{name}/run [post]
func imageRunHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		image := c.Params("name")
		// URL-decode the path parameter in case the frontend encoded characters
		// like ':' or '/' (e.g. "postgres%3Alatest") which would otherwise
		// be passed verbatim to the docker CLI and produce an invalid
		// reference format error. Prefer PathUnescape for path segments.
		if dec, err := url.PathUnescape(image); err == nil && dec != "" {
			image = dec
		}
		var req imageRunRequest
		_ = c.BodyParser(&req)
		if req.Port != 0 {
			if err := validator.ParseAndValidate(c, &req); err != nil {
				return err
			}
		}

		args := []string{"run", "-d"}
		if strings.TrimSpace(req.Name) != "" {
			args = append(args, "--name", strings.TrimSpace(req.Name))
		}
		if req.Port > 0 {
			args = append(args, "-p", fmt.Sprintf("%d:%d", req.Port, req.Port))
		}
		args = append(args, image)

		ctx, cancel := context.WithTimeout(c.UserContext(), 15*time.Second)
		defer cancel()
		out, err := runDocker(ctx, args...)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "image_run_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "container created", "container_id": strings.TrimSpace(string(out))})
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
	Name         string `json:"name"`
	Driver       string `json:"driver"`
	Scope        string `json:"scope"`
	CreatedAt    string `json:"created_at,omitempty"`
	Mountpoint   string `json:"mountpoint,omitempty"`
	RefCount     int    `json:"ref_count"`
	SizeBytes    int64  `json:"size_bytes,omitempty"`
	InUse        bool   `json:"in_use"`
	AttachedHint string `json:"attached_containers,omitempty"`
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
		ctx, cancel := context.WithTimeout(c.UserContext(), 8*time.Second)
		defer cancel()
		output, err := runDocker(ctx, "volume", "ls", "--format", "{{json .}}")
		if err != nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "volumes_list_failed", err.Error())
		}
		volumes := make([]volumeInfo, 0)
		names := make([]string, 0)
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			var data map[string]string
			if json.Unmarshal([]byte(line), &data) != nil {
				continue
			}
			n := strings.TrimSpace(data["Name"])
			if n == "" {
				continue
			}
			names = append(names, n)
			volumes = append(volumes, volumeInfo{
				Name:   n,
				Driver: data["Driver"],
				Scope:  data["Scope"],
			})
		}
		details := volumeInspectMap(ctx, names)
		for i := range volumes {
			if d, ok := details[volumes[i].Name]; ok {
				volumes[i].CreatedAt = d.CreatedAt
				volumes[i].Mountpoint = d.Mountpoint
				volumes[i].RefCount = d.RefCount
				volumes[i].SizeBytes = d.SizeBytes
				volumes[i].InUse = d.RefCount > 0
				if d.RefCount > 0 {
					volumes[i].AttachedHint = fmt.Sprintf("%d container(s)", d.RefCount)
				}
			}
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

type volumeCreateBody struct {
	Name   string `json:"name"`
	Driver string `json:"driver"`
}

func volumeCreateHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body volumeCreateBody
		if err := c.BodyParser(&body); err != nil {
			return response.BadRequest(c, "invalid request body")
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			return response.BadRequest(c, "volume name is required")
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 15*time.Second)
		defer cancel()
		args := []string{"volume", "create"}
		if d := strings.TrimSpace(body.Driver); d != "" {
			args = append(args, "--driver", d)
		}
		args = append(args, name)
		out, err := runDocker(ctx, args...)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "volume_create_failed", err.Error())
		}
		created := strings.TrimSpace(string(out))
		if created == "" {
			created = name
		}
		return response.OK(c, fiber.Map{"status": "volume created", "volume": created})
	}
}

type networkInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Driver string `json:"driver"`
	Scope  string `json:"scope"`
}

func listNetworksHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 8*time.Second)
		defer cancel()
		output, err := runDocker(ctx, "network", "ls", "--format", "{{json .}}")
		if err != nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "networks_list_failed", err.Error())
		}
		nets := make([]networkInfo, 0)
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var data map[string]any
			if json.Unmarshal([]byte(line), &data) != nil {
				continue
			}
			n := strings.TrimSpace(stringField(data["Name"]))
			if n == "host" || n == "none" {
				continue
			}
			nets = append(nets, networkInfo{
				ID:     stringField(data["ID"]),
				Name:   n,
				Driver: stringField(data["Driver"]),
				Scope:  stringField(data["Scope"]),
			})
		}
		return response.OK(c, fiber.Map{"networks": nets})
	}
}

func networksPruneHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 20*time.Second)
		defer cancel()
		out, err := runDocker(ctx, "network", "prune", "-f")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "networks_prune_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"status": "networks pruned", "output": strings.TrimSpace(string(out))})
	}
}

type volInspect struct {
	CreatedAt  string
	Mountpoint string
	RefCount   int
	SizeBytes  int64
}

func volumeInspectMap(ctx context.Context, names []string) map[string]volInspect {
	out := map[string]volInspect{}
	if len(names) == 0 {
		return out
	}
	const batch = 40
	for i := 0; i < len(names); i += batch {
		end := i + batch
		if end > len(names) {
			end = len(names)
		}
		chunk := names[i:end]
		args := append([]string{"volume", "inspect"}, chunk...)
		raw, err := runDocker(ctx, args...)
		if err != nil {
			continue
		}
		var arr []map[string]any
		if json.Unmarshal(raw, &arr) != nil {
			continue
		}
		for _, item := range arr {
			n := strings.TrimSpace(stringField(item["Name"]))
			if n == "" {
				continue
			}
			vi := volInspect{
				CreatedAt:  stringField(item["CreatedAt"]),
				Mountpoint: stringField(item["Mountpoint"]),
			}
			if ud, ok := item["UsageData"].(map[string]any); ok {
				vi.RefCount = intFromAny(ud["RefCount"])
				vi.SizeBytes = int64FromAny(ud["Size"])
			}
			out[n] = vi
		}
	}
	return out
}

func stringField(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return fmt.Sprintf("%.0f", t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

func intFromAny(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	default:
		return 0
	}
}

func int64FromAny(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n
	default:
		return 0
	}
}
