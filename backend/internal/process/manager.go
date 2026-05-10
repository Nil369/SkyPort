package process

import (
	"context"
	"errors"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
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

	// PM2 manager: use pm2 CLI to start/manage Node apps for zero-downtime reloads
	if req.Manager == "pm2" {
		if _, err := exec.LookPath("pm2"); err != nil {
			return 0, errors.New("pm2 binary not found in PATH")
		}
		// pm2 start --name <name> -- <cmd> <args...>
		args := []string{"start", "--name", req.Name, "--", req.Command}
		args = append(args, req.Args...)
		cmd := exec.CommandContext(ctx, "pm2", args...)
		cmd.Dir = req.Dir
		cmd.Env = req.Env
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		if err := cmd.Run(); err != nil {
			return 0, err
		}
		// Query pm2 for pid
		out, err := exec.CommandContext(ctx, "pm2", "pid", req.Name).Output()
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
		// stop + delete in pm2
		_ = exec.Command("pm2", "stop", name).Run()
		_ = exec.Command("pm2", "delete", name).Run()
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
		// ask pm2 for pid
		out, err := exec.Command("pm2", "pid", name).Output()
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
