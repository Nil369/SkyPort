package deployments

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/websocket/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/capabilities"
	"skyport/internal/envutil"
	"skyport/internal/models"
	"skyport/internal/pm2"
	"skyport/internal/process"
	"skyport/internal/response"
	"skyport/internal/runtime"
	"skyport/internal/security"
	wsinfra "skyport/internal/websocket"
)

type Module struct {
	pm   *process.Manager
	logs *logHub
	app  *app.App
}

func NewModule() *Module {
	return &Module{pm: process.NewManager(), logs: newLogHub()}
}

func (m *Module) Name() string { return "deployments" }

func (m *Module) Register(a *app.App) error {
	m.app = a
	deployBase, _ := filepath.Abs(filepath.Join(a.Config.WorkspaceRoot, "deployments"))
	logBase, _ := filepath.Abs(filepath.Join(a.Config.WorkspaceRoot, "logs"))
	_ = os.MkdirAll(deployBase, 0o755)
	_ = os.MkdirAll(logBase, 0o755)
	_ = os.MkdirAll(filepath.Join(a.Config.WorkspaceRoot, "runtimes"), 0o755)
	_ = os.MkdirAll(filepath.Join(a.Config.WorkspaceRoot, "proxy"), 0o755)
	_ = os.MkdirAll(filepath.Join(a.Config.WorkspaceRoot, "data"), 0o755)

	r := a.Fiber.Group("/api/v1/deployments")
	r.Use(auth.RequireJWT(a.Config.JWTSecret))
	r.Post("/", createDeployment(a, m, deployBase, logBase))
	r.Get("/", listDeployments(a))
	r.Get("/:id", getDeployment(a))
	r.Delete("/:id", deleteDeployment(a, m))
	r.Post("/:id/rollout", rolloutDeployment(a, m))
	r.Post("/:id/env", addEnvVar(a))
	r.Post("/:id/env/bulk", addEnvVarsBulk(a))
	r.Get("/:id/env", listEnvVars(a))

	a.Fiber.Use("/ws/deployments", wsAuth(a))
	a.Fiber.Get("/ws/deployments/:id/logs", gws.New(m.LogsWebSocket(), gws.Config{Subprotocols: []string{"jwt"}}))
	return nil
}

// LogsWebSocket streams deployment/process log lines over WebSocket.
// @Summary Deployment logs (WebSocket)
// @Tags Websocket
// @Description Streams deployment log lines after connection. Authenticate via Authorization Bearer, token query (?token=JWT), or Sec-WebSocket-Protocol jwt,JWT_TOKEN
// @Param id path string true "Deployment ID"
// @Router /ws/deployments/{id}/logs [get]
func (m *Module) LogsWebSocket() func(*gws.Conn) {
	return func(conn *gws.Conn) {
		id := conn.Params("id")
		if m.app != nil {
			var dep models.Deployment
			if err := m.app.DB.First(&dep, id).Error; err == nil {
				if p := strings.TrimSpace(dep.LogPath); p != "" {
					b, err := os.ReadFile(p)
					if err == nil && len(b) > 0 {
						const maxReplay = 512 * 1024
						if len(b) > maxReplay {
							hdr := []byte("[SkyPort] Showing last 512 KiB of log file:\n")
							b = append(hdr, b[len(b)-maxReplay:]...)
						}
						_ = conn.WriteMessage(gws.TextMessage, b)
					} else if err == nil {
						_ = conn.WriteMessage(gws.TextMessage, []byte("(deployment log file is empty so far)\n"))
					}
				}
			}
		}
		m.logs.registerConn(id, conn)
		defer func() {
			m.logs.unregisterConn(id, conn)
			_ = conn.Close()
		}()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}

type CreateDeploymentRequest struct {
	ProjectID         uint              `json:"project_id" validate:"required"`
	Strategy          string            `json:"strategy" validate:"omitempty,oneof=docker pm2 native"`
	AutoStart         bool              `json:"auto_start"`
	Port              int               `json:"port" validate:"omitempty,min=1,max=65535"`
	Env               map[string]string `json:"env"`
	WorkingDirectory  string            `json:"working_directory" validate:"omitempty,max=512"`
	StartCmd          string            `json:"start_cmd" validate:"omitempty,max=1024"`
	InstallCmd        string            `json:"install_cmd" validate:"omitempty,max=1024"`
	BuildCmd          string            `json:"build_cmd" validate:"omitempty,max=1024"`
	ContainerRegistry string            `json:"container_registry" validate:"omitempty,max=255"`
	ContainerImage    string            `json:"container_image" validate:"omitempty,max=255"`
	ContainerTag      string            `json:"container_tag" validate:"omitempty,max=128"`
	ContainerPush     bool              `json:"container_push"`
	ContainerUsername string            `json:"container_username" validate:"omitempty,max=255"`
	ContainerPassword string            `json:"container_password" validate:"omitempty,max=255"`
}

// @Summary Create deployment
// @Tags Deployments
// @Security BearerAuth
// @Description Creates a deployment. working_directory is ONLY a subfolder INSIDE the cloned repo (examples: server, client). Do not pass SKYPORT workspace paths—the server joins it onto project.path. Omit for auto-detection. Field runtime in JSON is ignored; detection runs locally. Responses include prefetch runtime/strategy; poll GET for live status during auto_start.
// @Accept json
// @Produce json
// @Param request body CreateDeploymentRequest true "Deployment payload"
// @Success 201 {object} models.Deployment
// @Failure 404 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments [post]
func createDeployment(a *app.App, m *Module, deployBase, logBase string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req CreateDeploymentRequest
		if err := c.BodyParser(&req); err != nil {
			return response.BadRequest(c, "invalid request body")
		}
		var project models.Project
		if err := a.DB.First(&project, req.ProjectID).Error; err != nil {
			return response.Error(c, fiber.StatusNotFound, "project_not_found", "project not found")
		}

		rt := runtime.Unknown
		strategy := capabilities.Detect(c.UserContext()).Recommendation
		if detect, detErr := runtime.NewDetector().Detect(project.Path); detErr == nil {
			rt = detect.Runtime
		}

		// IMPORTANT: If user explicitly selects PM2 or native strategy, use it—never apply Dockerfile runtime.
		// PM2 runs natively on host; if strategy is PM2, we still need the actual project runtime (node, python, etc)
		userSelectedStrategy := strings.TrimSpace(req.Strategy)
		if userSelectedStrategy != "" {
			strategy = strings.ToLower(userSelectedStrategy)
			if strategy == "pm2" || strategy == "native" {
				// If Docker was detected but user wants PM2/native, resolve the host runtime directly.
				if hostRuntime, _, _ := detectHostRuntimeAndStartCommand(project.Path); hostRuntime != runtime.Unknown {
					rt = hostRuntime
				} else if rt == runtime.Docker {
					rt = detectNonDockerRuntime(project.Path)
				}
			}
		}

		d := models.Deployment{
			ProjectID: project.ID,
			Path:      project.Path,
			Runtime:   string(rt),
			Strategy:  strategy,
			Status:    "pending",
			Port:      req.Port,
			LogPath:   filepath.Join(logBase, fmt.Sprintf("deployment-%d.log", time.Now().UnixNano())),
		}
		if err := a.DB.Create(&d).Error; err != nil {
			return err
		}
		if len(req.Env) > 0 {
			envRes := envutil.NormalizeMap(req.Env)
			envs := make([]models.EnvironmentVariable, 0, len(envRes.Vars))
			for key, value := range envRes.Vars {
				envs = append(envs, models.EnvironmentVariable{
					DeploymentID: d.ID,
					Key:          key,
					Value:        value,
					Masked:       false,
				})
			}
			if len(envs) > 0 {
				_ = a.DB.Create(&envs).Error
			}
		}
		if req.AutoStart {
			go m.runDeployment(context.Background(), a, &d, req, deployBase)
		}
		return response.JSON(c, fiber.StatusCreated, d)
	}
}

func (m *Module) runDeployment(ctx context.Context, a *app.App, d *models.Deployment, req CreateDeploymentRequest, deployBase string) {
	logf, _ := os.OpenFile(d.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if logf != nil {
		defer logf.Close()
	}
	log := func(status, msg string) {
		_ = a.DB.Model(d).Updates(map[string]any{"status": status, "updated_at": time.Now()}).Error
		line := fmt.Sprintf("[%s] %s\n", status, msg)
		if logf != nil {
			_, _ = logf.WriteString(line)
		}
		m.logs.publish(strconv.FormatUint(uint64(d.ID), 10), []byte(line))
	}

	log("cloning", "preparing deployment workspace")
	workDir := filepath.Join(deployBase, fmt.Sprintf("%d", d.ID))
	_ = os.MkdirAll(workDir, 0o755)

	log("installing", "detecting runtime")
	detect, err := runtime.NewDetector().Detect(d.Path)
	if err != nil {
		_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
		return
	}
	cap := capabilities.Detect(ctx)
	if strings.TrimSpace(req.Strategy) != "" {
		d.Strategy = strings.ToLower(strings.TrimSpace(req.Strategy))
	} else {
		d.Strategy = cap.Recommendation
	}
	startCmd := strings.TrimSpace(req.StartCmd)
	installCmd := strings.TrimSpace(req.InstallCmd)
	if installCmd == "" {
		installCmd = strings.TrimSpace(detect.InstallCommand)
	}
	if startCmd == "" && (d.Strategy == "pm2" || d.Strategy == "native") {
		// Prefer recursive detection results if they found a valid language stack
		if detect.Runtime != runtime.Docker && detect.Runtime != runtime.Unknown && detect.Runtime != runtime.Compose {
			d.Runtime = string(detect.Runtime)
			startCmd = detect.StartCommand
			if installCmd == "" {
				installCmd = detect.InstallCommand
			}
		} else {
			hRt, hStart, hInstall := detectHostRuntimeAndStartCommand(d.Path)
			if hRt != runtime.Unknown {
				d.Runtime = string(hRt)
				startCmd = hStart
				if installCmd == "" {
					installCmd = hInstall
				}
			} else {
				d.Runtime = string(detectNonDockerRuntime(d.Path))
				startCmd = defaultStartCommandForRuntime(d.Runtime)
				if installCmd == "" {
					// Fallback: if we know it's Node, we definitely want npm install
					if d.Runtime == string(runtime.Node) {
						installCmd = "npm install"
					}
				}
			}
		}
	} else if d.Runtime == "" {
		d.Runtime = string(detect.Runtime)
	}
	if startCmd == "" {
		startCmd = strings.TrimSpace(detect.StartCommand)
	}
	if startCmd == "" && (d.Strategy == "pm2" || d.Strategy == "native") {
		startCmd = defaultStartCommandForRuntime(d.Runtime)
	}
	_ = a.DB.Model(d).Updates(map[string]any{"runtime": d.Runtime, "strategy": d.Strategy}).Error

	projectName := fmt.Sprintf("project-%d", d.ProjectID)
	var project models.Project
	if err := a.DB.First(&project, d.ProjectID).Error; err == nil {
		if strings.TrimSpace(project.Name) != "" {
			projectName = project.Name
		}
	}
	appName := fmt.Sprintf("skyport_%d_%s", d.ProjectID, normalizeAppName(projectName))

	workRoot, usedFallbackFrom := resolveDeploymentWorkDir(d.Path, req.WorkingDirectory, detect.WorkingDirectory)
	msg := fmt.Sprintf("working directory: %s", workRoot)
	if usedFallbackFrom != "" {
		msg += fmt.Sprintf(" (adjusted from invalid override %s)", usedFallbackFrom)
	}
	log("installing", msg)

	env := os.Environ()
	var envs []models.EnvironmentVariable
	_ = a.DB.Where("deployment_id = ?", d.ID).Find(&envs).Error
	for _, e := range envs {
		env = append(env, e.Key+"="+e.Value)
	}

	if installCmd != "" {
		log("installing", installCmd)
		if err := runStep(ctx, workRoot, env, installCmd, logf, m.logs, d.ID); err != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
			return
		}
	}

	buildCmd := strings.TrimSpace(req.BuildCmd)
	if buildCmd == "" {
		buildCmd = strings.TrimSpace(detect.BuildCommand)
	}
	// Safety: Skip default build commands if the script is missing from package.json
	if buildCmd != "" && (strings.Contains(buildCmd, "npm run build") || strings.Contains(buildCmd, "yarn build") || strings.Contains(buildCmd, "pnpm build")) {
		if !hasScriptInPackageJson(workRoot, "build") {
			log("building", "skipping build step: 'build' script not found in package.json")
			buildCmd = ""
		}
	}
	if buildCmd != "" {
		log("building", buildCmd)
		if err := runStep(ctx, workRoot, env, buildCmd, logf, m.logs, d.ID); err != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
			return
		}
	}

	if !req.AutoStart {
		_ = a.DB.Model(d).Update("status", "starting").Error
		return
	}

	if startCmd == "" {
		startCmd = defaultStartCommandForRuntime(d.Runtime)
	}
	if startCmd == "" {
		startCmd = "echo no start command found"
	}

	log("starting", startCmd)
	parts := strings.Fields(startCmd)
	if len(parts) > 0 {
		// On Windows, if we are using PM2, we should NOT resolve npm/yarn/pnpm to their absolute .cmd paths
		// because PM2 will try to run them via Node.js, leading to SyntaxErrors.
		isPkgManager := parts[0] == "npm" || parts[0] == "yarn" || parts[0] == "pnpm" || parts[0] == "bun"
		if !isPkgManager || filepath.Separator != '\\' {
			if full, err := exec.LookPath(parts[0]); err == nil {
				parts[0] = full
			}
		}
	}

	switch strings.ToLower(d.Strategy) {
	case "docker":
		imageName := appName
		imageTag := strings.TrimSpace(req.ContainerTag)
		if imageTag == "" {
			imageTag = "latest"
		}
		imageRepo := strings.TrimSpace(req.ContainerImage)
		if imageRepo == "" {
			imageRepo = imageName
		}
		registry := strings.TrimSpace(req.ContainerRegistry)
		fullImage := imageRepo + ":" + imageTag
		if registry != "" {
			fullImage = registry + "/" + fullImage
		}
		// Build image
		buildCmd := fmt.Sprintf("docker build -t %s .", imageName)
		log("building", buildCmd)
		if err := runStep(ctx, workRoot, env, buildCmd, logf, m.logs, d.ID); err != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
			return
		}
		// Optional registry login + tag + push
		if req.ContainerPush || req.ContainerImage != "" || registry != "" {
			if registry != "" && req.ContainerUsername != "" {
				if err := dockerLogin(ctx, registry, req.ContainerUsername, req.ContainerPassword, logf); err != nil {
					_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
					return
				}
			}
			if fullImage != imageName {
				tagCmd := fmt.Sprintf("docker tag %s %s", imageName, fullImage)
				log("building", tagCmd)
				if err := runStep(ctx, workRoot, env, tagCmd, logf, m.logs, d.ID); err != nil {
					_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
					return
				}
			}
			if req.ContainerPush {
				pushCmd := fmt.Sprintf("docker push %s", fullImage)
				log("building", pushCmd)
				if err := runStep(ctx, workRoot, env, pushCmd, logf, m.logs, d.ID); err != nil {
					_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
					return
				}
			}
		}
		// Run container with restart policy
		containerName := appName
		_ = exec.CommandContext(ctx, "docker", "rm", "-f", containerName).Run()
		runParts := []string{"docker", "run", "-d", "--name", containerName, "--restart", "unless-stopped"}
		if req.Port > 0 {
			runParts = append(runParts, "-p", fmt.Sprintf("%d:%d", req.Port, req.Port))
		}
		// env vars
		for _, ev := range envs {
			runParts = append(runParts, "-e", ev.Key+"="+ev.Value)
		}
		runImage := imageName
		if req.ContainerImage != "" || registry != "" {
			runImage = fullImage
		}
		runParts = append(runParts, runImage)
		runCmd := strings.Join(runParts, " ")
		log("starting", runCmd)
		var runOut []byte
		if filepath.Separator == '\\' {
			cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", runCmd)
			cmd.Dir = workRoot
			cmd.Env = env
			runOut, err = cmd.CombinedOutput()
		} else {
			cmd := exec.CommandContext(ctx, "sh", "-c", runCmd)
			cmd.Dir = workRoot
			cmd.Env = env
			runOut, err = cmd.CombinedOutput()
		}
		if err != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
			if logf != nil {
				_, _ = logf.WriteString(string(runOut))
			}
			return
		}
		containerID := strings.TrimSpace(string(runOut))
		_ = a.DB.Create(&models.Process{
			DeploymentID: d.ID,
			PID:          0,
			Manager:      "docker",
			Command:      containerID,
			Status:       "running",
		}).Error
		_ = a.DB.Model(d).Update("status", "running").Error
		log("running", fmt.Sprintf("container started id=%s", containerID))
		return
	case "pm2":
		name := appName
		ecosystemPath, ecoErr := writePm2Ecosystem(filepath.Join(deployBase, fmt.Sprintf("%d", d.ID)), name, workRoot, parts, env)
		if ecoErr != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": ecoErr.Error()}).Error
			return
		}
		// if pm2 already running -> reload, else start
		pidOut := func() []byte {
			cmd, err := pm2.Command(ctx, "pid", name)
			if err != nil {
				return nil
			}
			b, _ := cmd.Output()
			return b
		}()
		pidStr := strings.TrimSpace(string(pidOut))
		if pidStr != "" && pidStr != "0" {
			cmd, err := pm2.Command(ctx, "reload", name, "--update-env")
			if err != nil {
				_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
				return
			}
			cmd.Dir = workRoot
			cmd.Env = append(os.Environ(), env...)
			cmd.Stdout = logf
			cmd.Stderr = logf
			if err := cmd.Run(); err != nil {
				_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
				return
			}
		} else {
			startArgs := []string{"start", ecosystemPath, "--only", name, "--update-env"}
			cmd, err := pm2.Command(ctx, startArgs...)
			if err != nil {
				_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
				return
			}
			cmd.Dir = workRoot
			cmd.Env = append(os.Environ(), env...)
			cmd.Stdout = logf
			cmd.Stderr = logf
			if err := cmd.Run(); err != nil {
				_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
				return
			}
		}
		// persist pm2 list for restart after reboot
		if saveCmd, err := pm2.Command(ctx, "save"); err == nil {
			_ = saveCmd.Run()
		}
		// try to get pid
		pidOut2 := func() []byte {
			cmd, err := pm2.Command(ctx, "pid", name)
			if err != nil {
				return nil
			}
			b, _ := cmd.Output()
			return b
		}()
		pid2 := 0
		if p := strings.TrimSpace(string(pidOut2)); p != "" {
			if v, err := strconv.Atoi(p); err == nil {
				pid2 = v
			}
		}
		_ = a.DB.Create(&models.Process{
			DeploymentID: d.ID,
			PID:          pid2,
			Manager:      "pm2",
			Command:      startCmd,
			Status:       "running",
		}).Error
		_ = a.DB.Model(d).Update("status", "running").Error
		log("running", fmt.Sprintf("pm2 managed app started pid=%d", pid2))
		return
	default:
		pid, err := m.pm.Start(ctx, process.StartRequest{
			Manager: d.Strategy,
			Name:    appName,
			Command: parts[0],
			Args:    parts[1:],
			Dir:     workRoot,
			Env:     env,
		}, logf, logf)
		if err != nil {
			_ = a.DB.Model(d).Updates(map[string]any{"status": "failed", "error": err.Error()}).Error
			return
		}
		_ = a.DB.Create(&models.Process{
			DeploymentID: d.ID,
			PID:          pid,
			Manager:      d.Strategy,
			Command:      startCmd,
			Status:       "running",
		}).Error
		_ = a.DB.Model(d).Update("status", "running").Error
		log("running", fmt.Sprintf("process started pid=%d", pid))
		return
	}
}

func normalizeAppName(input string) string {
	name := strings.ToLower(strings.TrimSpace(input))
	if name == "" {
		return "app"
	}
	var b strings.Builder
	lastUnderscore := false
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			b.WriteRune('_')
			lastUnderscore = true
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "app"
	}
	return out
}

// resolveDeploymentWorkDir chooses: user's working_directory → detected subdirectory → cloned repo root.
// discardedOverrideReason is set when override was provided but unusable so we fell back.
func resolveDeploymentWorkDir(projectRoot, override, detected string) (abs string, discardedOverrideReason string) {
	o := strings.TrimSpace(override)
	if o != "" {
		full, ok := tryResolvedWorkDir(projectRoot, o)
		if ok {
			return full, ""
		}
		discardedOverrideReason = "invalid repo-relative path (use e.g. server or client)"
	}
	if d := strings.TrimSpace(detected); d != "" {
		full, ok := tryResolvedWorkDir(projectRoot, d)
		if ok {
			if o != "" {
				return full, discardedOverrideReason
			}
			return full, ""
		}
	}

	rootAbs, err := security.EnsureWithinRoot(projectRoot, projectRoot)
	if err != nil {
		rootAbs = filepath.Clean(projectRoot)
	}
	return rootAbs, discardedOverrideReason
}

func tryResolvedWorkDir(projectRoot, sub string) (string, bool) {
	sub = filepath.ToSlash(filepath.Clean(strings.ReplaceAll(strings.TrimSpace(sub), `\`, `/`)))
	if sub == "." {
		sub = ""
	}
	if filepath.IsAbs(filepath.FromSlash(sub)) {
		return "", false
	}
	full := filepath.Join(projectRoot, filepath.FromSlash(sub))
	abs, err := security.EnsureWithinRoot(projectRoot, full)
	if err != nil {
		return "", false
	}
	st, err := os.Stat(abs)
	if err != nil || !st.IsDir() {
		return "", false
	}
	return abs, true
}

func runStep(ctx context.Context, dir string, env []string, command string, logf *os.File, hub *logHub, depID uint) error {
	if strings.TrimSpace(command) == "" {
		return nil
	}
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	if filepath.Separator == '\\' {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
	}
	cmd.Dir = dir
	cmd.Env = env
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	dep := strconv.FormatUint(uint64(depID), 10)
	for _, rd := range []*bufio.Reader{bufio.NewReader(stdout), bufio.NewReader(stderr)} {
		go func(r *bufio.Reader) {
			for {
				line, err := r.ReadString('\n')
				if line != "" {
					if logf != nil {
						_, _ = logf.WriteString(line)
					}
					hub.publish(dep, []byte(line))
				}
				if err != nil {
					return
				}
			}
		}(rd)
	}
	return cmd.Wait()
}

func dockerLogin(ctx context.Context, registry, username, password string, logf *os.File) error {
	if username == "" {
		return nil
	}
	args := []string{"login"}
	if registry != "" {
		args = append(args, registry)
	}
	args = append(args, "-u", username, "--password-stdin")
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdin = bytes.NewBufferString(password)
	cmd.Stdout = logf
	cmd.Stderr = logf
	return cmd.Run()
}

func writePm2Ecosystem(baseDir, name, cwd string, parts []string, env []string) (string, error) {
	if len(parts) == 0 {
		return "", fmt.Errorf("pm2 start command is empty")
	}
	_ = os.MkdirAll(baseDir, 0o755)
	path := filepath.Join(baseDir, "ecosystem.config.js")
	cmd := parts[0]
	args := []string{}
	if len(parts) > 1 {
		args = append(args, parts[1:]...)
	}
	envMap := map[string]string{}
	for _, e := range env {
		if strings.TrimSpace(e) == "" {
			continue
		}
		kv := strings.SplitN(e, "=", 2)
		if len(kv) != 2 {
			continue
		}
		envMap[kv[0]] = kv[1]
	}
	interpreter := ""
	if filepath.Separator == '\\' {
		lowCmd := strings.ToLower(cmd)
		isPkg := lowCmd == "npm" || lowCmd == "yarn" || lowCmd == "pnpm" || lowCmd == "bun"
		if isPkg || strings.HasSuffix(lowCmd, ".cmd") || strings.HasSuffix(lowCmd, ".bat") {
			// On Windows, PM2 struggles with .cmd files. Use cmd.exe /c to launch them natively.
			newArgs := []string{"/c", cmd}
			newArgs = append(newArgs, args...)
			cmd = "cmd.exe"
			args = newArgs
			interpreter = "none"
		}
	}

	argsJSON, _ := json.Marshal(args)
	envJSON, _ := json.Marshal(envMap)

	content := fmt.Sprintf("module.exports = {\n  apps: [{\n    name: %q,\n    cwd: %q,\n    script: %q,\n    args: %s,\n    env: %s,\n    autorestart: true,\n    watch: false,\n    max_memory_restart: \"1G\",\n    restart_delay: 3000,\n    interpreter: %q\n  }]\n};\n", 
		name, cwd, cmd, string(argsJSON), string(envJSON), interpreter)
	return path, os.WriteFile(path, []byte(content), 0o644)
}

type rolloutRequest struct {
	Mode string `json:"mode" validate:"omitempty,oneof=reload restart"`
}

// @Summary Rollout deployment
// @Tags Deployments
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Deployment ID"
// @Param request body rolloutRequest false "Rollout request"
// @Success 200 {object} map[string]any
// @Failure 404 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id}/rollout [post]
func rolloutDeployment(a *app.App, m *Module) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var dep models.Deployment
		if err := a.DB.First(&dep, id).Error; err != nil {
			return response.Error(c, fiber.StatusNotFound, "deployment_not_found", "deployment not found")
		}
		var proc models.Process
		_ = a.DB.Where("deployment_id = ?", dep.ID).Order("created_at DESC").First(&proc).Error
		mode := "reload"
		var req rolloutRequest
		if err := c.BodyParser(&req); err == nil && req.Mode != "" {
			mode = req.Mode
		}

		name := "deployment-" + id
		switch strings.ToLower(proc.Manager) {
		case "pm2":
			cmdArgs := []string{"reload", name, "--update-env"}
			if mode == "restart" {
				cmdArgs = []string{"restart", name, "--update-env"}
			}
			cmd, err := pm2.Command(context.Background(), cmdArgs...)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "rollout_failed", err.Error())
			}
			if err := cmd.Run(); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "rollout_failed", err.Error())
			}
			return response.OK(c, fiber.Map{"status": "ok", "manager": "pm2", "mode": mode})
		case "docker":
			cmd := exec.Command("docker", "restart", name)
			if err := cmd.Run(); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "rollout_failed", err.Error())
			}
			return response.OK(c, fiber.Map{"status": "ok", "manager": "docker", "mode": "restart"})
		default:
			if err := m.pm.Stop(name); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "rollout_failed", err.Error())
			}
			return response.OK(c, fiber.Map{"status": "ok", "manager": "native", "mode": "restart"})
		}
	}
}

// @Summary List deployments
// @Tags Deployments
// @Security BearerAuth
// @Produce json
// @Success 200 {array} models.Deployment
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments [get]
func listDeployments(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var items []models.Deployment
		if err := a.DB.Order("created_at DESC").Find(&items).Error; err != nil {
			return err
		}
		return response.OK(c, items)
	}
}

// @Summary Get deployment
// @Tags Deployments
// @Security BearerAuth
// @Produce json
// @Param id path string true "Deployment ID"
// @Success 200 {object} models.Deployment
// @Failure 404 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id} [get]
func getDeployment(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var item models.Deployment
		if err := a.DB.First(&item, c.Params("id")).Error; err != nil {
			return response.Error(c, fiber.StatusNotFound, "deployment_not_found", "deployment not found")
		}
		return response.OK(c, item)
	}
}

// @Summary Delete deployment
// @Tags Deployments
// @Security BearerAuth
// @Produce json
// @Param id path string true "Deployment ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id} [delete]
func deleteDeployment(a *app.App, m *Module) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var item models.Deployment
		if err := a.DB.First(&item, id).Error; err != nil {
			return response.Error(c, fiber.StatusNotFound, "deployment_not_found", "deployment not found")
		}
		_ = m.pm.Stop("deployment-" + id)
		_ = a.DB.Where("deployment_id = ?", item.ID).Delete(&models.Process{}).Error
		_ = a.DB.Where("deployment_id = ?", item.ID).Delete(&models.EnvironmentVariable{}).Error
		if err := a.DB.Delete(&item).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"deleted": item.ID})
	}
}

type EnvVarRequest struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Masked bool   `json:"masked"`
}

type bulkEnvPair struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Masked bool   `json:"masked"`
}

type BulkEnvRequest struct {
	Items   []bulkEnvPair `json:"items"`
	EnvText string        `json:"env_text"`
}

// @Summary Add deployment environment variable
// @Tags Deployments
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Deployment ID"
// @Param request body EnvVarRequest true "Env payload"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id}/env [post]
func addEnvVar(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return response.BadRequest(c, "invalid deployment id")
		}
		var req EnvVarRequest
		if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Key) == "" {
			return response.BadRequest(c, "invalid env payload")
		}
		if !envutil.ValidKey(req.Key) {
			return response.BadRequest(c, "invalid env key: use letters, numbers, underscore; must start with letter or underscore")
		}
		row := models.EnvironmentVariable{DeploymentID: uint(id), Key: strings.TrimSpace(req.Key), Value: req.Value, Masked: req.Masked}
		if err := a.DB.Create(&row).Error; err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{"id": row.ID})
	}
}

// @Summary List deployment environment variables
// @Tags Deployments
// @Security BearerAuth
// @Produce json
// @Param id path string true "Deployment ID"
// @Success 200 {array} object
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id}/env [get]
func listEnvVars(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return response.BadRequest(c, "invalid deployment id")
		}
		var vars []models.EnvironmentVariable
		if err := a.DB.Where("deployment_id = ?", id).Find(&vars).Error; err != nil {
			return err
		}
		type item struct {
			Key    string `json:"key"`
			Value  string `json:"value"`
			Masked bool   `json:"masked"`
		}
		out := make([]item, 0, len(vars))
		for _, v := range vars {
			val := v.Value
			if v.Masked {
				val = "******"
			}
			out = append(out, item{Key: v.Key, Value: val, Masked: v.Masked})
		}
		return response.OK(c, out)
	}
}

// @Summary Add env vars in bulk
// @Tags Deployments
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Deployment ID"
// @Param request body BulkEnvRequest true "Bulk env payload"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/deployments/{id}/env/bulk [post]
func addEnvVarsBulk(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return response.BadRequest(c, "invalid deployment id")
		}
		var req BulkEnvRequest
		if err := c.BodyParser(&req); err != nil {
			return response.BadRequest(c, "invalid env payload")
		}

		items := make([]bulkEnvPair, 0, len(req.Items)+16)
		items = append(items, req.Items...)
		if strings.TrimSpace(req.EnvText) != "" {
			items = append(items, parseEnvText(req.EnvText)...)
		}
		if len(items) == 0 {
			return response.BadRequest(c, "no env items provided")
		}

		seen := map[string]struct{}{}
		created := 0
		for _, it := range items {
			k := strings.TrimSpace(it.Key)
			if k == "" || !envutil.ValidKey(k) {
				continue
			}
			if _, ok := seen[k]; ok {
				continue
			}
			seen[k] = struct{}{}
			row := models.EnvironmentVariable{
				DeploymentID: uint(id),
				Key:          k,
				Value:        it.Value,
				Masked:       it.Masked,
			}
			if err := a.DB.Create(&row).Error; err != nil {
				return err
			}
			created++
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{"created": created})
	}
}

func parseEnvText(raw string) []bulkEnvPair {
	res := envutil.ParseLines(raw)
	out := make([]bulkEnvPair, 0, len(res.Vars))
	for k, v := range res.Vars {
		out = append(out, bulkEnvPair{Key: k, Value: v})
	}
	return out
}

func wsAuth(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		connHdr := strings.ToLower(c.Get("Connection"))
		upgHdr := strings.ToLower(c.Get("Upgrade"))
		if strings.Contains(connHdr, "upgrade") && strings.Contains(upgHdr, "websocket") {
			token := wsinfra.ExtractToken(c)
			if token == "" {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			if _, err := auth.ParseAccessToken(token, a.Config.JWTSecret); err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
		}
		return c.Next()
	}
}

type logHub struct {
	mu   sync.RWMutex
	subs map[string]map[*gws.Conn]struct{}
}

func newLogHub() *logHub { return &logHub{subs: map[string]map[*gws.Conn]struct{}{}} }

func (h *logHub) publish(id string, line []byte) {
	h.mu.RLock()
	conns := h.subs[id]
	h.mu.RUnlock()
	for conn := range conns {
		_ = conn.WriteMessage(gws.TextMessage, line)
	}
}

func (h *logHub) registerConn(id string, conn *gws.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[id] == nil {
		h.subs[id] = map[*gws.Conn]struct{}{}
	}
	h.subs[id][conn] = struct{}{}
}

func (h *logHub) unregisterConn(id string, conn *gws.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.subs[id]; m != nil {
		delete(m, conn)
	}
}

// detectNonDockerRuntime attempts to find the actual project runtime (node, python, go, etc)
// by re-scanning and ignoring Docker as a classification, looking for the underlying language markers.
func detectNonDockerRuntime(projectPath string) runtime.Kind {
	// Create a secondary detection that can detect runtime markers EXCEPT Dockerfile
	det := runtime.NewDetector()
	result, err := det.Detect(projectPath)
	if err != nil || result.Runtime == runtime.Docker {
		// If Docker is still the result, look for next best match in Components
		for _, comp := range result.Components {
			if comp.Kind == runtime.Node {
				return runtime.Node
			}
			if comp.Kind == runtime.Python {
				return runtime.Python
			}
			if comp.Kind == runtime.Go {
				return runtime.Go
			}
		}
		// Default to Node if Docker was detected but no other runtime found (common pattern: Node app in Dockerfile)
		return runtime.Node
	}
	return result.Runtime
}

func detectHostRuntimeAndStartCommand(projectPath string) (runtime.Kind, string, string) {
	if rt, cmd, inst := detectNodeHostRuntime(projectPath); rt != runtime.Unknown {
		return rt, cmd, inst
	}
	if hasAnyFile(projectPath, "pyproject.toml", "requirements.txt", "main.py", "app.py", "wsgi.py", "asgi.py") {
		return runtime.Python, "python -m uvicorn main:app --host 0.0.0.0 --port 8000", "pip install -r requirements.txt"
	}
	if hasAnyFile(projectPath, "go.mod") {
		return runtime.Go, "go run .", "go mod download"
	}
	if hasAnyFile(projectPath, "Cargo.toml") {
		return runtime.Rust, "cargo run", "cargo fetch"
	}
	if hasAnyFile(projectPath, "composer.json", "index.php", "public/index.php") {
		return runtime.PHP, "php -S 0.0.0.0:8080 -t public", "composer install"
	}
	if hasAnyFile(projectPath, "pom.xml", "build.gradle", "build.gradle.kts") {
		return runtime.Java, "java -jar target/app.jar", "mvn install"
	}
	if hasAnyFile(projectPath, "bun.lockb") {
		return runtime.Bun, "bun run start", "bun install"
	}
	return runtime.Unknown, "", ""
}

func detectNodeHostRuntime(projectPath string) (runtime.Kind, string, string) {
	pkgPath := filepath.Join(projectPath, "package.json")
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		return runtime.Unknown, "", ""
	}
	var pkg map[string]any
	if err := json.Unmarshal(data, &pkg); err != nil {
		return runtime.Node, "npm start", "npm install"
	}
	packageManager := inferPackageManager(projectPath)
	installCmd := "npm install"
	switch packageManager {
	case "yarn":
		installCmd = "yarn install"
	case "pnpm":
		installCmd = "pnpm install"
	case "bun":
		installCmd = "bun install"
	}

	if scripts, ok := pkg["scripts"].(map[string]any); ok {
		if _, ok := scripts["start"].(string); ok {
			return runtime.Node, formatPackageManagerCommand(packageManager, "start"), installCmd
		}
		if _, ok := scripts["dev"].(string); ok {
			return runtime.Node, formatPackageManagerCommand(packageManager, "run dev"), installCmd
		}
	}
	return runtime.Node, formatPackageManagerCommand(packageManager, "start"), installCmd
}

func inferPackageManager(projectPath string) string {
	switch {
	case hasAnyFile(projectPath, "bun.lockb"):
		return "bun"
	case hasAnyFile(projectPath, "pnpm-lock.yaml"):
		return "pnpm"
	case hasAnyFile(projectPath, "yarn.lock"):
		return "yarn"
	default:
		return "npm"
	}
}

func formatPackageManagerCommand(packageManager, command string) string {
	packageManager = strings.TrimSpace(packageManager)
	command = strings.TrimSpace(command)
	if packageManager == "" {
		packageManager = "npm"
	}
	switch packageManager {
	case "bun":
		if command == "run dev" {
			return "bun run dev"
		}
		return "bun run start"
	case "pnpm":
		if command == "run dev" {
			return "pnpm run dev"
		}
		return "pnpm start"
	case "yarn":
		if command == "run dev" {
			return "yarn dev"
		}
		return "yarn start"
	default:
		if command == "run dev" {
			return "npm run dev"
		}
		return "npm start"
	}
}

func defaultStartCommandForRuntime(kind string) string {
	switch strings.ToLower(kind) {
	case string(runtime.Node):
		return "npm start"
	case string(runtime.Python):
		return "python -m uvicorn main:app --host 0.0.0.0 --port 8000"
	case string(runtime.Go):
		return "go run ."
	case string(runtime.Rust):
		return "cargo run"
	case string(runtime.PHP):
		return "php -S 0.0.0.0:8080 -t public"
	case string(runtime.Java):
		return "java -jar target/app.jar"
	case string(runtime.Bun):
		return "bun run start"
	default:
		return ""
	}
}

func hasAnyFile(projectPath string, names ...string) bool {
	for _, name := range names {
		if _, err := os.Stat(filepath.Join(projectPath, name)); err == nil {
			return true
		}
	}
	return false
}

func hasScriptInPackageJson(dir, scriptName string) bool {
	pkgPath := filepath.Join(dir, "package.json")
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		return false
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return false
	}
	_, ok := pkg.Scripts[scriptName]
	return ok
}

