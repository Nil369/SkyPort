package process

import (
	"context"
	"errors"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"

	"skyport/internal/pm2"
)

type StartRequest struct {
	Manager string
	Name    string
	Command string
	Args    []string
	Dir     string
	Env     []string
}

type RunningProcess struct {
	Cmd     *exec.Cmd
	Pid     int
	Manager string
}

type Manager struct {
	mu      sync.RWMutex
	running map[string]*RunningProcess
}

func NewManager() *Manager {
	return &Manager{running: map[string]*RunningProcess{}}
}

func (m *Manager) Start(ctx context.Context, req StartRequest, stdout, stderr io.Writer) (int, error) {
	if req.Command == "" {
		return 0, errors.New("command is required")
	}

	// PM2 manager: host-native pm2 CLI (never inside Docker).
	if req.Manager == "pm2" {
		if _, err := pm2.ResolveBinary(); err != nil {
			return 0, errors.New("pm2 binary not found in PATH")
		}
		args := []string{"start", "--name", req.Name, "--", req.Command}
		args = append(args, req.Args...)
		cmd, err := pm2.Command(ctx, args...)
		if err != nil {
			return 0, err
		}
		cmd.Dir = req.Dir
		cmd.Env = req.Env
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		if err := cmd.Run(); err != nil {
			return 0, err
		}
		pidCmd, err := pm2.Command(ctx, "pid", req.Name)
		if err != nil {
			m.mu.Lock()
			m.running[req.Name] = &RunningProcess{Cmd: nil, Pid: 0, Manager: "pm2"}
			m.mu.Unlock()
			return 0, nil
		}
		out, err := pidCmd.Output()
		if err != nil {
			// started but couldn't fetch pid; return success with pid 0
			m.mu.Lock()
			m.running[req.Name] = &RunningProcess{Cmd: nil, Pid: 0, Manager: "pm2"}
			m.mu.Unlock()
			return 0, nil
		}
		pidStr := strings.TrimSpace(string(out))
		pid, _ := strconv.Atoi(pidStr)
		m.mu.Lock()
		m.running[req.Name] = &RunningProcess{Cmd: nil, Pid: pid, Manager: "pm2"}
		m.mu.Unlock()
		return pid, nil
	}

	// Native process manager (default)
	cmd := exec.CommandContext(ctx, req.Command, req.Args...)
	cmd.Dir = req.Dir
	cmd.Env = req.Env
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return 0, err
	}
	m.mu.Lock()
	m.running[req.Name] = &RunningProcess{Cmd: cmd, Pid: cmd.Process.Pid, Manager: "native"}
	m.mu.Unlock()
	return cmd.Process.Pid, nil
}

func (m *Manager) Stop(name string) error {
	m.mu.RLock()
	p := m.running[name]
	m.mu.RUnlock()
	if p == nil {
		return nil
	}
	if p.Manager == "pm2" {
		ctx := context.Background()
		if c1, err := pm2.Command(ctx, "stop", name); err == nil {
			_ = c1.Run()
		}
		if c2, err := pm2.Command(ctx, "delete", name); err == nil {
			_ = c2.Run()
		}
		m.mu.Lock()
		delete(m.running, name)
		m.mu.Unlock()
		return nil
	}
	if p.Cmd == nil || p.Cmd.Process == nil {
		return nil
	}
	err := p.Cmd.Process.Kill()
	m.mu.Lock()
	delete(m.running, name)
	m.mu.Unlock()
	return err
}

func (m *Manager) Health(name string) string {
	m.mu.RLock()
	p := m.running[name]
	m.mu.RUnlock()
	if p == nil {
		return "stopped"
	}
	if p.Manager == "pm2" {
		pidCmd, err := pm2.Command(context.Background(), "pid", name)
		if err != nil {
			return "stopped"
		}
		out, err := pidCmd.Output()
		if err != nil {
			return "stopped"
		}
		pidStr := strings.TrimSpace(string(out))
		if pidStr == "0" || pidStr == "" {
			return "stopped"
		}
		return "running"
	}
	if p.Cmd == nil || p.Cmd.Process == nil {
		return "stopped"
	}
	return "running"
}
