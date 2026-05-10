package orchestrator

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
	"skyport/internal/response"
	"skyport/internal/security"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "orchestrator" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/orchestrator")
	r.Use(auth.RequireJWT(a.Config.JWTSecret))
	r.Get("/status", statusHandler())
	r.Post("/deploy", deployHandler(a))
	r.Post("/k8s/install", k8sInstallHandler())
	r.Post("/compose/convert", convertComposeHandler(a))
	r.Post("/k8s/generate", generateK8sHandler(a))
	r.Post("/health", healthHandler())
	return nil
}

type statusResponse struct {
	DockerAvailable  bool   `json:"docker_available"`
	SwarmActive      bool   `json:"swarm_active"`
	KubectlAvailable bool   `json:"kubectl_available"`
	KubeContext      string `json:"kube_context"`
}

// @Summary Orchestrator status
// @Tags Orchestrator
// @Security BearerAuth
// @Produce json
// @Success 200 {object} statusResponse
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/status [get]
func statusHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		dockerAvailable := exec.Command("docker", "version").Run() == nil
		swarmActive := false
		if dockerAvailable {
			out, err := exec.Command("docker", "info", "--format", "{{.Swarm.LocalNodeState}}").Output()
			if err == nil && strings.TrimSpace(string(out)) == "active" {
				swarmActive = true
			}
		}
		kubectlAvailable := exec.Command("kubectl", "version", "--client", "--short").Run() == nil
		kubeContext := ""
		if kubectlAvailable {
			out, err := exec.Command("kubectl", "config", "current-context").Output()
			if err == nil {
				kubeContext = strings.TrimSpace(string(out))
			}
		}
		return response.OK(c, statusResponse{
			DockerAvailable:  dockerAvailable,
			SwarmActive:      swarmActive,
			KubectlAvailable: kubectlAvailable,
			KubeContext:      kubeContext,
		})
	}
}

type deployRequest struct {
	Type         string `json:"type" validate:"required,oneof=swarm k8s"`
	ProjectPath  string `json:"project_path" validate:"required,max=2048"`
	ComposePath  string `json:"compose_path" validate:"omitempty,max=2048"`
	StackName    string `json:"stack_name" validate:"omitempty,max=120"`
	ManifestPath string `json:"manifest_path" validate:"omitempty,max=2048"`
	Namespace    string `json:"namespace" validate:"omitempty,max=120"`
	KubeContext  string `json:"kube_context" validate:"omitempty,max=200"`
	DryRun       bool   `json:"dry_run"`
	Execute      bool   `json:"execute"`
}

// @Summary Orchestrator deploy
// @Tags Orchestrator
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body deployRequest true "Deploy input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/deploy [post]
func deployHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req deployRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		projectPath, err := resolveProjectPath(a.Config.WorkspaceRoot, req.ProjectPath)
		if err != nil {
			return response.BadRequest(c, "invalid project path")
		}
		effectiveExecute := req.Execute && !req.DryRun

		switch strings.ToLower(req.Type) {
		case "swarm":
			compose := strings.TrimSpace(req.ComposePath)
			if compose == "" {
				compose = filepath.Join(projectPath, "docker-compose.yml")
			}
			composePath, err := resolveProjectPath(a.Config.WorkspaceRoot, compose)
			if err != nil {
				return response.BadRequest(c, "invalid compose path")
			}
			stackName := strings.TrimSpace(req.StackName)
			if stackName == "" {
				stackName = "skyport"
			}
			cmdArgs := []string{"stack", "deploy", "-c", composePath, stackName}
			output := ""
			if effectiveExecute {
				ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Minute)
				defer cancel()
				out, err := exec.CommandContext(ctx, "docker", cmdArgs...).CombinedOutput()
				output = strings.TrimSpace(string(out))
				if err != nil {
					return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "orchestrator_deploy_failed", err.Error(), fiber.Map{"output": output, "command": "docker " + strings.Join(cmdArgs, " ")})
				}
			}
			return response.OK(c, fiber.Map{
				"type":              "swarm",
				"compose_path":      composePath,
				"stack_name":        stackName,
				"dry_run":           req.DryRun,
				"execute":           req.Execute,
				"effective_execute": effectiveExecute,
				"command":           "docker " + strings.Join(cmdArgs, " "),
				"output":            output,
			})
		case "k8s":
			if !kubectlAvailable() {
				cmd, notes := kubectlInstallHint()
				return response.ErrorWithDetails(c, fiber.StatusBadRequest, "kubectl_missing", "kubectl is not installed on this host", fiber.Map{"install_command": cmd, "install_notes": notes})
			}
			if ctxName := strings.TrimSpace(req.KubeContext); ctxName != "" {
				if ok, list := kubeContextExists(ctxName); !ok {
					return response.ErrorWithDetails(c, fiber.StatusBadRequest, "kube_context_missing", "kube context does not exist", fiber.Map{"available_contexts": list})
				}
			}
			manifest := strings.TrimSpace(req.ManifestPath)
			if manifest == "" {
				manifest = filepath.Join(projectPath, "k8s")
			}
			manifestPath, err := resolveProjectPath(a.Config.WorkspaceRoot, manifest)
			if err != nil {
				return response.BadRequest(c, "invalid manifest path")
			}
			cmdArgs := []string{"apply", "-f", manifestPath}
			if ns := strings.TrimSpace(req.Namespace); ns != "" {
				cmdArgs = append(cmdArgs, "-n", ns)
			}
			if ctx := strings.TrimSpace(req.KubeContext); ctx != "" {
				cmdArgs = append([]string{"--context", ctx}, cmdArgs...)
			}
			output := ""
			if effectiveExecute {
				ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Minute)
				defer cancel()
				out, err := exec.CommandContext(ctx, "kubectl", cmdArgs...).CombinedOutput()
				output = strings.TrimSpace(string(out))
				if err != nil {
					return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "orchestrator_deploy_failed", err.Error(), fiber.Map{"output": output, "command": "kubectl " + strings.Join(cmdArgs, " ")})
				}
			}
			return response.OK(c, fiber.Map{
				"type":              "k8s",
				"manifest_path":     manifestPath,
				"namespace":         req.Namespace,
				"kube_context":      req.KubeContext,
				"dry_run":           req.DryRun,
				"execute":           req.Execute,
				"effective_execute": effectiveExecute,
				"command":           "kubectl " + strings.Join(cmdArgs, " "),
				"output":            output,
			})
		}
		return response.BadRequest(c, "unsupported orchestrator type")
	}
}

type k8sInstallRequest struct {
	DryRun  bool `json:"dry_run"`
	Execute bool `json:"execute"`
}

// @Summary Install kubectl
// @Tags Orchestrator
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body k8sInstallRequest true "Install input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/k8s/install [post]
func k8sInstallHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req k8sInstallRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		cmd, notes := kubectlInstallHint()
		effectiveExecute := req.Execute && !req.DryRun
		output := ""
		if effectiveExecute && cmd != "" {
			ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Minute)
			defer cancel()
			out, err := exec.CommandContext(ctx, "sh", "-c", cmd).CombinedOutput()
			if runtime.GOOS == "windows" {
				out, err = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", cmd).CombinedOutput()
				if err != nil {
					output = strings.TrimSpace(string(out))
					return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "kubectl_install_failed", err.Error(), fiber.Map{"output": output, "command": cmd})
				}
			}
			if err != nil {
				output = strings.TrimSpace(string(out))
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "kubectl_install_failed", err.Error(), fiber.Map{"output": output, "command": cmd})
			}
			output = strings.TrimSpace(string(out))
		}
		return response.OK(c, fiber.Map{
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"command":           cmd,
			"install_notes":     notes,
			"output":            output,
		})
	}
}

func kubectlAvailable() bool {
	return exec.Command("kubectl", "version", "--client", "--short").Run() == nil
}

func kubectlInstallHint() (string, string) {
	switch runtime.GOOS {
	case "linux":
		return "curl -fsSL https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl", "Requires sudo/root permissions."
	case "darwin":
		return "brew install kubectl", "Requires Homebrew."
	case "windows":
		return "winget install -e --id Kubernetes.kubectl", "Requires admin privileges in some environments."
	default:
		return "", "Unsupported OS for automated kubectl install."
	}
}

func kubeContextExists(name string) (bool, []string) {
	out, err := exec.Command("kubectl", "config", "get-contexts", "-o", "name").Output()
	if err != nil {
		return false, nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, l := range lines {
		if strings.TrimSpace(l) == name {
			return true, lines
		}
	}
	return false, lines
}

func resolveProjectPath(root, input string) (string, error) {
	clean := filepath.Clean(strings.ReplaceAll(strings.TrimSpace(input), `\\`, `/`))
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

type convertComposeRequest struct {
	ProjectPath string `json:"project_path" validate:"required,max=2048"`
	ComposePath string `json:"compose_path" validate:"omitempty,max=2048"`
	OutputPath  string `json:"output_path" validate:"omitempty,max=2048"`
	DryRun      bool   `json:"dry_run"`
	Execute     bool   `json:"execute"`
}

// @Summary Convert compose for swarm
// @Tags Orchestrator
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body convertComposeRequest true "Convert input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/compose/convert [post]
func convertComposeHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req convertComposeRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		projectPath, err := resolveProjectPath(a.Config.WorkspaceRoot, req.ProjectPath)
		if err != nil {
			return response.BadRequest(c, "invalid project path")
		}
		compose := strings.TrimSpace(req.ComposePath)
		if compose == "" {
			compose = filepath.Join(projectPath, "docker-compose.yml")
		}
		composePath, err := resolveProjectPath(a.Config.WorkspaceRoot, compose)
		if err != nil {
			return response.BadRequest(c, "invalid compose path")
		}
		outputPath := strings.TrimSpace(req.OutputPath)
		if outputPath == "" {
			outputPath = filepath.Join(projectPath, "compose.swarm.yml")
		}
		outputPath, err = resolveProjectPath(a.Config.WorkspaceRoot, outputPath)
		if err != nil {
			return response.BadRequest(c, "invalid output path")
		}
		cmdArgs := []string{"compose", "-f", composePath, "convert"}
		commandStr := "docker " + strings.Join(cmdArgs, " ")
		effectiveExecute := req.Execute && !req.DryRun
		output := ""
		if effectiveExecute {
			ctx, cancel := context.WithTimeout(c.UserContext(), 5*time.Minute)
			defer cancel()
			out, err := exec.CommandContext(ctx, "docker", cmdArgs...).CombinedOutput()
			output = string(out)
			if err != nil {
				return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "compose_convert_failed", err.Error(), fiber.Map{"output": strings.TrimSpace(output), "command": commandStr})
			}
			if err := os.WriteFile(outputPath, []byte(output), 0o644); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "write_failed", err.Error())
			}
		}
		return response.OK(c, fiber.Map{
			"compose_path":      composePath,
			"output_path":       outputPath,
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"command":           commandStr,
			"output":            strings.TrimSpace(output),
		})
	}
}

type generateK8sRequest struct {
	ProjectPath    string            `json:"project_path" validate:"required,max=2048"`
	AppName        string            `json:"app_name" validate:"omitempty,max=120"`
	Runtime        string            `json:"runtime" validate:"required,oneof=node python"`
	Image          string            `json:"image" validate:"required,max=255"`
	Port           int               `json:"port" validate:"required,min=1,max=65535"`
	Replicas       int               `json:"replicas" validate:"omitempty,min=1,max=50"`
	Namespace      string            `json:"namespace" validate:"omitempty,max=120"`
	Env            map[string]string `json:"env"`
	LivenessPath   string            `json:"liveness_path" validate:"omitempty,max=255"`
	ReadinessPath  string            `json:"readiness_path" validate:"omitempty,max=255"`
	HealthPort     int               `json:"health_port" validate:"omitempty,min=1,max=65535"`
	MaxUnavailable string            `json:"max_unavailable" validate:"omitempty,max=20"`
	MaxSurge       string            `json:"max_surge" validate:"omitempty,max=20"`
}

// @Summary Generate K8s manifests
// @Tags Orchestrator
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body generateK8sRequest true "K8s generator input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/k8s/generate [post]
func generateK8sHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req generateK8sRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		projectPath, err := resolveProjectPath(a.Config.WorkspaceRoot, req.ProjectPath)
		if err != nil {
			return response.BadRequest(c, "invalid project path")
		}
		appName := strings.TrimSpace(req.AppName)
		if appName == "" {
			appName = filepath.Base(projectPath)
		}
		replicas := req.Replicas
		if replicas == 0 {
			replicas = 1
		}
		healthPort := req.HealthPort
		if healthPort == 0 {
			healthPort = req.Port
		}
		maxUnavailable := strings.TrimSpace(req.MaxUnavailable)
		if maxUnavailable == "" {
			maxUnavailable = "0"
		}
		maxSurge := strings.TrimSpace(req.MaxSurge)
		if maxSurge == "" {
			maxSurge = "1"
		}
		k8sDir := filepath.Join(projectPath, "k8s")
		_ = os.MkdirAll(k8sDir, 0o755)
		manifestPath := filepath.Join(k8sDir, appName+".yaml")
		manifest := renderK8sManifest(appName, req.Image, req.Port, replicas, req.Namespace, req.Env, req.LivenessPath, req.ReadinessPath, healthPort, maxUnavailable, maxSurge)
		if err := os.WriteFile(manifestPath, []byte(manifest), 0o644); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "write_failed", err.Error())
		}
		return response.OK(c, fiber.Map{
			"manifest_path": manifestPath,
			"content":       manifest,
		})
	}
}

func renderK8sManifest(appName, image string, port, replicas int, namespace string, env map[string]string, livenessPath, readinessPath string, healthPort int, maxUnavailable, maxSurge string) string {
	nsLine := ""
	if strings.TrimSpace(namespace) != "" {
		nsLine = "  namespace: " + namespace + "\n"
	}
	envBlock := ""
	if len(env) > 0 {
		lines := []string{"          env:"}
		for k, v := range env {
			lines = append(lines, "          - name: "+k)
			lines = append(lines, "            value: \""+strings.ReplaceAll(v, "\"", "\\\"")+"\"")
		}
		envBlock = strings.Join(lines, "\n") + "\n"
	}
	probeBlock := func(path string, port int) string {
		if strings.TrimSpace(path) == "" {
			return ""
		}
		return fmt.Sprintf("          httpGet:\n            path: %s\n            port: %d\n          initialDelaySeconds: 5\n          periodSeconds: 10\n", path, port)
	}
	liveness := probeBlock(livenessPath, healthPort)
	if liveness != "" {
		liveness = "        livenessProbe:\n" + liveness
	}
	readiness := probeBlock(readinessPath, healthPort)
	if readiness != "" {
		readiness = "        readinessProbe:\n" + readiness
	}

	return fmt.Sprintf("apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: %s\n%s\nspec:\n  replicas: %d\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: %s\n      maxSurge: %s\n  selector:\n    matchLabels:\n      app: %s\n  template:\n    metadata:\n      labels:\n        app: %s\n    spec:\n      containers:\n      - name: %s\n        image: %s\n        ports:\n        - containerPort: %d\n%s%s%s---\napiVersion: v1\nkind: Service\nmetadata:\n  name: %s\n%s\nspec:\n  selector:\n    app: %s\n  ports:\n  - port: %d\n    targetPort: %d\n", appName, nsLine, replicas, maxUnavailable, maxSurge, appName, appName, appName, image, port, envBlock, liveness, readiness, appName, nsLine, appName, port, port)
}

type healthRequest struct {
	Type      string `json:"type" validate:"required,oneof=swarm k8s"`
	Namespace string `json:"namespace" validate:"omitempty,max=120"`
	StackName string `json:"stack_name" validate:"omitempty,max=120"`
	Selector  string `json:"selector" validate:"omitempty,max=200"`
	DryRun    bool   `json:"dry_run"`
	Execute   bool   `json:"execute"`
}

// @Summary Orchestrator health
// @Tags Orchestrator
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body healthRequest true "Health input"
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/orchestrator/health [post]
func healthHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req healthRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		effectiveExecute := req.Execute && !req.DryRun
		output := ""
		var commandStr string
		switch strings.ToLower(req.Type) {
		case "swarm":
			stack := strings.TrimSpace(req.StackName)
			if stack == "" {
				stack = "skyport"
			}
			cmdArgs := []string{"service", "ls", "--filter", "label=com.docker.stack.namespace=" + stack}
			commandStr = "docker " + strings.Join(cmdArgs, " ")
			if effectiveExecute {
				out, err := exec.Command("docker", cmdArgs...).CombinedOutput()
				output = strings.TrimSpace(string(out))
				if err != nil {
					return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "orchestrator_health_failed", err.Error(), fiber.Map{"output": output, "command": commandStr})
				}
			}
		case "k8s":
			selector := strings.TrimSpace(req.Selector)
			if selector == "" {
				selector = "app=skyport"
			}
			cmdArgs := []string{"get", "deploy,svc,pods", "-l", selector}
			if ns := strings.TrimSpace(req.Namespace); ns != "" {
				cmdArgs = append(cmdArgs, "-n", ns)
			}
			commandStr = "kubectl " + strings.Join(cmdArgs, " ")
			if effectiveExecute {
				out, err := exec.Command("kubectl", cmdArgs...).CombinedOutput()
				output = strings.TrimSpace(string(out))
				if err != nil {
					return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "orchestrator_health_failed", err.Error(), fiber.Map{"output": output, "command": commandStr})
				}
			}
		default:
			return response.BadRequest(c, "unsupported orchestrator type")
		}
		return response.OK(c, fiber.Map{
			"type":              req.Type,
			"dry_run":           req.DryRun,
			"execute":           req.Execute,
			"effective_execute": effectiveExecute,
			"command":           commandStr,
			"output":            output,
		})
	}
}
