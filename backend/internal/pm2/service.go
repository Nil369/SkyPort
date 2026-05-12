package pm2

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strconv"
	"strings"
	"time"
)

// ErrNotInstalled is returned when no PM2 CLI is found on the host PATH.
var ErrNotInstalled = errors.New("pm2 not found on host PATH")

// ResolveBinary returns the host PM2 executable path.
// Linux/macOS: pm2. Windows: prefers pm2.cmd, then pm2.
// Commands always run on the host OS process namespace (never inside Docker).
func ResolveBinary() (string, error) {
	if goruntime.GOOS == "windows" {
		if p, err := exec.LookPath("pm2.cmd"); err == nil && p != "" {
			return p, nil
		}
	}
	p, err := exec.LookPath("pm2")
	if err != nil || p == "" {
		return "", ErrNotInstalled
	}
	return p, nil
}

// Command builds an exec.Cmd for the resolved host PM2 binary.
func Command(ctx context.Context, args ...string) (*exec.Cmd, error) {
	bin, err := ResolveBinary()
	if err != nil {
		return nil, err
	}
	if goruntime.GOOS == "windows" {
		// Use powershell -Command to invoke pm2 on Windows
		var builder strings.Builder
		builder.WriteString("& ")
		builder.WriteString(fmt.Sprintf("%q", bin))
		for _, arg := range args {
			builder.WriteString(" ")
			if strings.Contains(arg, " ") || strings.Contains(arg, "&") || strings.Contains(arg, "(") {
				builder.WriteString(fmt.Sprintf("%q", arg))
			} else {
				builder.WriteString(arg)
			}
		}
		return exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", builder.String()), nil
	}
	return exec.CommandContext(ctx, bin, args...), nil
}

// Service runs native PM2 CLI operations on the host.
type Service struct{}

// NewService creates a stateless PM2 service helper.
func NewService() *Service { return &Service{} }

// JListRaw returns the raw JSON from `pm2 jlist`.
func (s *Service) JListRaw(ctx context.Context) ([]byte, error) {
	bin, err := ResolveBinary()
	if err != nil {
		return nil, err
	}
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, bin, "jlist")
	return cmd.Output()
}

// ListProcesses parses pm2 jlist into ProcessDTO values.
func (s *Service) ListProcesses(ctx context.Context) ([]ProcessDTO, error) {
	raw, err := s.JListRaw(ctx)
	if err != nil {
		return nil, err
	}
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("parse jlist: %w", err)
	}
	out := make([]ProcessDTO, 0, len(items))
	for _, m := range items {
		out = append(out, mapItemToDTO(m))
	}
	return out, nil
}

// RunAction executes start|stop|restart|delete on a named process (host PM2).
func (s *Service) RunAction(ctx context.Context, action, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("empty process name")
	}
	switch action {
	case "start", "stop", "restart", "delete":
	default:
		return "", fmt.Errorf("unsupported action %q", action)
	}
	cmd, err := Command(ctx, action, name)
	if err != nil {
		return "", err
	}
	b, err := cmd.CombinedOutput()
	out := strings.TrimSpace(string(b))
	if err != nil {
		fmt.Printf("PM2 action %s on %s failed: %v\nOutput: %s\n", action, name, err, out)
	}
	return out, err
}

// Logs returns recent log lines via PM2 (host), non-streaming when supported.
func (s *Service) Logs(ctx context.Context, name string, lines int) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("empty process name")
	}
	if lines <= 0 {
		lines = 100
	}
	if lines > 2000 {
		lines = 2000
	}
	cctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	// --nostream: available in modern PM2; avoids hanging on follow mode.
	cmd, err := Command(cctx, "logs", name, "--lines", strconv.Itoa(lines), "--nostream")
	if err != nil {
		return "", err
	}
	b, err := cmd.CombinedOutput()
	if err == nil {
		return strings.TrimSpace(string(b)), nil
	}
	cctx2, cancel2 := context.WithTimeout(ctx, 12*time.Second)
	defer cancel2()
	cmd2, err2 := Command(cctx2, "logs", name, "--lines", strconv.Itoa(lines), "--raw")
	if err2 != nil {
		return strings.TrimSpace(string(b)), err
	}
	b2, err3 := cmd2.CombinedOutput()
	return strings.TrimSpace(string(b2)), err3
}

func mapItemToDTO(m map[string]any) ProcessDTO {
	var dto ProcessDTO
	env, _ := m["pm2_env"].(map[string]any)
	mon, _ := m["monit"].(map[string]any)

	dto.Name = stringField(m["name"])
	if dto.Name == "" {
		dto.Name = stringField(env["name"])
	}
	dto.PMID = intField(m["pm_id"])
	if dto.PMID == 0 {
		dto.PMID = intField(env["pm_id"])
	}
	dto.PID = intField(m["pid"])
	if dto.PID == 0 {
		dto.PID = intField(env["pm_pid"])
	}
	dto.Status = strings.ToLower(stringField(env["status"]))
	if dto.Status == "" {
		dto.Status = "unknown"
	}
	dto.CPU = floatField(mon["cpu"])
	dto.MemoryBytes = uint64(floatField(mon["memory"]))
	dto.Restarts = intField(env["restart_time"])
	dto.Unstable = intField(env["unstable_restarts"])
	dto.ExecMode = stringField(env["exec_mode"])
	dto.Interpreter = stringField(env["interpreter"])
	dto.Script = stringField(env["pm_exec_path"])
	if dto.Script == "" {
		dto.Script = stringField(env["script"])
	}
	dto.Cwd = stringField(env["cwd"])
	dto.RuntimeType = inferRuntimeType(dto.Interpreter, dto.ExecMode, env)
	dto.Namespace = stringField(env["namespace"])
	dto.EnvPort = inferPort(env)
	dto.Ports = collectPorts(env, dto.EnvPort)
	dto.Framework = inferFramework(dto.Script, dto.Cwd)
	dto.GroupKey = inferGroupKey(dto.Cwd, dto.Namespace)

	// Uptime: prefer created_at (ms) while process is meant to be running.
	created := int64Field(env["created_at"])
	nowMs := time.Now().UnixMilli()
	if created > 0 && dto.Status == "online" {
		sec := (nowMs - created) / 1000
		if sec < 0 {
			sec = 0
		}
		dto.UptimeSec = sec
	} else {
		dto.UptimeSec = 0
	}
	return dto
}

func inferRuntimeType(interpreter, execMode string, env map[string]any) string {
	i := strings.TrimSpace(strings.ToLower(interpreter))
	switch {
	case strings.Contains(i, "node"):
		return "node"
	case strings.Contains(i, "bun"):
		return "bun"
	case strings.Contains(i, "python") || strings.Contains(i, "python3"):
		return "python"
	case strings.Contains(i, "php"):
		return "php"
	case strings.Contains(i, "ruby"):
		return "ruby"
	case i != "":
		return i
	case strings.Contains(strings.ToLower(execMode), "cluster"):
		return "cluster"
	default:
		if stringField(env["exec_interpreter"]) != "" {
			return strings.ToLower(stringField(env["exec_interpreter"]))
		}
		return "fork"
	}
}

func collectPorts(env map[string]any, envPort int) []int {
	seen := map[int]struct{}{}
	var out []int
	add := func(n int) {
		if n <= 0 || n >= 65536 {
			return
		}
		if _, ok := seen[n]; ok {
			return
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	if envPort > 0 {
		add(envPort)
	}
	if raw, ok := env["ports"]; ok {
		if arr, ok := raw.([]any); ok {
			for _, it := range arr {
				switch t := it.(type) {
				case map[string]any:
					add(intField(t["port"]))
				case float64:
					add(int(t))
				}
			}
		}
	}
	return out
}

func inferFramework(script, cwd string) string {
	blob := strings.ToLower(script + " " + cwd)
	switch {
	case strings.Contains(blob, "next"):
		return "next"
	case strings.Contains(blob, "nuxt"):
		return "nuxt"
	case strings.Contains(blob, "vite"):
		return "vite"
	case strings.Contains(blob, "nest"):
		return "nestjs"
	case strings.Contains(blob, "fastapi"):
		return "fastapi"
	case strings.Contains(blob, "flask"):
		return "flask"
	case strings.Contains(blob, "django"):
		return "django"
	case strings.Contains(blob, "uvicorn"):
		return "uvicorn"
	case strings.Contains(blob, "express") || strings.Contains(blob, "server.js") || strings.Contains(blob, "app.js"):
		return "express"
	case strings.Contains(blob, "vue"):
		return "vue"
	case strings.Contains(blob, "react-scripts"):
		return "cra"
	default:
		return ""
	}
}

func inferGroupKey(cwd, namespace string) string {
	ns := strings.TrimSpace(namespace)
	if ns != "" {
		return "ns:" + ns
	}
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		return "host"
	}
	cwd = filepath.Clean(cwd)
	base := filepath.Base(cwd)
	if base == "/" || base == "." {
		return "host"
	}
	return base
}

func inferPort(env map[string]any) int {
	e, _ := env["env"].(map[string]any)
	if e == nil {
		return 0
	}
	for _, key := range []string{"PORT", "APP_PORT", "SERVER_PORT"} {
		if v, ok := e[key]; ok {
			if n, ok := parsePort(v); ok {
				return n
			}
		}
	}
	return 0
}

func parsePort(v any) (int, bool) {
	switch t := v.(type) {
	case float64:
		if t > 0 && t < 65536 {
			return int(t), true
		}
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(t))
		if err == nil && n > 0 && n < 65536 {
			return n, true
		}
	}
	return 0, false
}

func stringField(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case json.Number:
		return t.String()
	default:
		return ""
	}
}

func intField(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		return 0
	}
}

func int64Field(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n
	case json.Number:
		i, _ := t.Int64()
		return i
	default:
		return 0
	}
}

func floatField(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}
