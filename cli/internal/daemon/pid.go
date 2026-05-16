package daemon

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type AlreadyRunningError struct {
	PID int
}

func (e *AlreadyRunningError) Error() string {
	if e == nil {
		return "SkyPort backend already running"
	}
	if e.PID > 0 {
		return fmt.Sprintf("SkyPort backend already running (pid %d)", e.PID)
	}
	return "SkyPort backend already running"
}

func WritePID(pid int) error {
	manager, err := New()
	if err != nil {
		return err
	}
	return manager.WritePID(pid)
}

func ReadPID() (int, error) {
	manager, err := New()
	if err != nil {
		return 0, err
	}
	return manager.ReadPID()
}

func RemovePID() error {
	manager, err := New()
	if err != nil {
		return err
	}
	return manager.RemovePID()
}

func IsRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	return processExists(pid)
}

func (m *Manager) WritePID(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid pid %d", pid)
	}
	return os.WriteFile(m.pidPath, []byte(fmt.Sprintf("%d\n", pid)), 0o600)
}

func (m *Manager) ReadPID() (int, error) {
	data, err := os.ReadFile(m.pidPath)
	if err != nil {
		return 0, err
	}
	value := strings.TrimSpace(string(data))
	if value == "" {
		return 0, fmt.Errorf("empty pid file")
	}
	pid, err := strconv.Atoi(value)
	if err != nil {
		return 0, err
	}
	return pid, nil
}

func (m *Manager) RemovePID() error {
	if err := os.Remove(m.pidPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
