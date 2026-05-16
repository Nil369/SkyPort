package daemon

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	defaultHost = "127.0.0.1"
	defaultPort = 8080
)

var ErrNotRunning = errors.New("SkyPort backend is not running")

type Options struct {
	BaseDir    string
	BinaryPath string
	Host       string
	Port       int
}

type Manager struct {
	baseDir    string
	pidPath    string
	logsDir    string
	logPath    string
	dataDir    string
	configDir  string
	workspace  string
	binaryPath string
	host       string
	port       int
}

type paths struct {
	baseDir      string
	pidPath      string
	logsDir      string
	logPath      string
	dataDir      string
	configDir    string
	workspaceDir string
}

func New() (*Manager, error) {
	return NewWithOptions(Options{})
}

func NewWithOptions(opts Options) (*Manager, error) {
	baseDir, err := resolveBaseDir(opts.BaseDir)
	if err != nil {
		return nil, err
	}
	layout := buildPaths(baseDir)
	if err := ensureLayout(layout); err != nil {
		return nil, err
	}

	binaryPath, err := resolveBinary(opts.BinaryPath)
	if err != nil {
		return nil, err
	}

	host := normalizeHost(opts.Host)
	if host == "" {
		host = normalizeHost(os.Getenv("SKYPORT_HOST"))
	}
	if host == "" {
		host = defaultHost
	}

	port := opts.Port
	if port <= 0 {
		port = envPort("SKYPORT_PORT", defaultPort)
	}

	return &Manager{
		baseDir:    layout.baseDir,
		pidPath:    layout.pidPath,
		logsDir:    layout.logsDir,
		logPath:    layout.logPath,
		dataDir:    layout.dataDir,
		configDir:  layout.configDir,
		workspace:  layout.workspaceDir,
		binaryPath: binaryPath,
		host:       host,
		port:       port,
	}, nil
}

func buildPaths(baseDir string) paths {
	return paths{
		baseDir:      baseDir,
		pidPath:      filepath.Join(baseDir, "skyport.pid"),
		logsDir:      filepath.Join(baseDir, "logs"),
		logPath:      filepath.Join(baseDir, "logs", "server.log"),
		dataDir:      filepath.Join(baseDir, "data"),
		configDir:    filepath.Join(baseDir, "config"),
		workspaceDir: filepath.Join(baseDir, "workspace"),
	}
}

func ensureLayout(p paths) error {
	for _, dir := range []string{p.baseDir, p.logsDir, p.dataDir, p.configDir, p.workspaceDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}
	return nil
}

func resolveBaseDir(explicit string) (string, error) {
	if trimmed := strings.TrimSpace(explicit); trimmed != "" {
		return absPath(trimmed)
	}
	if env := strings.TrimSpace(os.Getenv("SKYPORT_HOME")); env != "" {
		if path, err := absPath(env); err == nil {
			return path, nil
		}
	}

	var candidates []string
	if runtime.GOOS == "windows" {
		if programFiles := strings.TrimSpace(os.Getenv("ProgramFiles")); programFiles != "" {
			candidates = append(candidates, filepath.Join(programFiles, "SkyPort"))
		}
		if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
			candidates = append(candidates, filepath.Join(localAppData, "SkyPort"))
		}
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidates = append(candidates, filepath.Join(home, ".skyport"))
	}
	candidates = append(candidates, filepath.Join(os.TempDir(), "skyport"))

	for _, candidate := range candidates {
		path, err := absPath(candidate)
		if err != nil {
			continue
		}
		if err := ensureLayout(buildPaths(path)); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("unable to resolve SkyPort home directory")
}

func absPath(path string) (string, error) {
	if filepath.IsAbs(path) {
		return path, nil
	}
	return filepath.Abs(path)
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}
	if strings.Contains(host, "://") {
		if parsed, err := url.Parse(host); err == nil && parsed.Hostname() != "" {
			return parsed.Hostname()
		}
	}
	return host
}

func envPort(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func (m *Manager) BaseDir() string      { return m.baseDir }
func (m *Manager) PIDPath() string      { return m.pidPath }
func (m *Manager) LogsPath() string     { return m.logPath }
func (m *Manager) DataDir() string      { return m.dataDir }
func (m *Manager) ConfigDir() string    { return m.configDir }
func (m *Manager) WorkspaceDir() string { return m.workspace }
func (m *Manager) BinaryPath() string   { return m.binaryPath }
func (m *Manager) Host() string         { return m.host }
func (m *Manager) Port() int            { return m.port }

func (m *Manager) WebURL() string {
	host := displayHost(m.host)
	return fmt.Sprintf("http://%s:%d", host, m.port)
}

func (m *Manager) HealthURL() string {
	return m.WebURL() + "/api/v1/health"
}

func (m *Manager) runtimeEnv() []string {
	env := append([]string{}, os.Environ()...)
	env = append(env,
		"SKYPORT_HOST="+m.host,
		fmt.Sprintf("SKYPORT_PORT=%d", m.port),
		"SKYPORT_DB_PATH="+filepath.ToSlash(filepath.Join(".", "data", "skyport.db")),
		"SKYPORT_WORKSPACE_ROOT="+filepath.ToSlash(filepath.Join(".", "workspace")),
		"SKYPORT_ENV=production",
		"SKYPORT_LOG_LEVEL=info",
		"SKYPORT_SHUTDOWN_TIMEOUT_SEC=10",
	)
	return env
}

func displayHost(host string) string {
	host = strings.TrimSpace(host)
	switch host {
	case "", "0.0.0.0", "::", "127.0.0.1":
		return "localhost"
	default:
		return host
	}
}

func (m *Manager) EnsureRunning(ctx context.Context) error {
	status, err := m.Status(ctx)
	if err != nil {
		return err
	}
	if status.Running {
		return nil
	}
	_, err = m.Start(ctx)
	var already *AlreadyRunningError
	if errors.As(err, &already) {
		return nil
	}
	return err
}

func (m *Manager) Start(ctx context.Context) (int, error) {
	if status, err := m.Status(ctx); err == nil && status.Running {
		return status.PID, &AlreadyRunningError{PID: status.PID}
	}

	if err := ensureLayout(buildPaths(m.baseDir)); err != nil {
		return 0, err
	}

	logFile, err := os.OpenFile(m.logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	defer logFile.Close()

	cmd := exec.CommandContext(ctx, m.binaryPath)
	cmd.Dir = m.baseDir
	cmd.Env = m.runtimeEnv()
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	configureDetachedCommand(cmd)

	if err := cmd.Start(); err != nil {
		return 0, err
	}

	pid := cmd.Process.Pid
	if err := m.WritePID(pid); err != nil {
		_ = terminateProcess(pid)
		_ = cmd.Process.Kill()
		return 0, err
	}
	_ = cmd.Process.Release()
	return pid, nil
}

func (m *Manager) Stop(ctx context.Context) error {
	pid, err := m.ReadPID()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if !m.IsRunning(pid) {
		_ = m.RemovePID()
		return nil
	}
	if err := terminateProcess(pid); err != nil {
		return err
	}
	return m.RemovePID()
}

func (m *Manager) Restart(ctx context.Context) error {
	if err := m.Stop(ctx); err != nil && !errors.Is(err, ErrNotRunning) {
		return err
	}
	time.Sleep(2 * time.Second)
	_, err := m.Start(ctx)
	if err != nil {
		var already *AlreadyRunningError
		if errors.As(err, &already) {
			return nil
		}
	}
	return err
}

func (m *Manager) IsRunning(pid int) bool { return IsRunning(pid) }

func (m *Manager) WaitForHealthy(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		healthy, err := m.healthy(ctx)
		if err == nil && healthy {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(750 * time.Millisecond):
		}
	}
	return fmt.Errorf("SkyPort backend did not become healthy at %s", m.HealthURL())
}

func (m *Manager) healthy(ctx context.Context) (bool, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, m.HealthURL(), nil)
	if err != nil {
		return false, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK, nil
}
