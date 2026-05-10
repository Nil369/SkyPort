package process

import (
	"context"
	"errors"
	"io"
	"os/exec"
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
	Cmd *exec.Cmd
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
	cmd := exec.CommandContext(ctx, req.Command, req.Args...)
	cmd.Dir = req.Dir
	cmd.Env = req.Env
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return 0, err
	}
	m.mu.Lock()
	m.running[req.Name] = &RunningProcess{Cmd: cmd}
	m.mu.Unlock()
	return cmd.Process.Pid, nil
}

func (m *Manager) Stop(name string) error {
	m.mu.RLock()
	p := m.running[name]
	m.mu.RUnlock()
	if p == nil || p.Cmd == nil || p.Cmd.Process == nil {
		return nil
	}
	return p.Cmd.Process.Kill()
}

func (m *Manager) Health(name string) string {
	m.mu.RLock()
	p := m.running[name]
	m.mu.RUnlock()
	if p == nil || p.Cmd == nil || p.Cmd.Process == nil {
		return "stopped"
	}
	return "running"
}
