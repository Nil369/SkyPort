package daemon

import (
	"context"
	"errors"
	"os"
	"time"
)

type Status struct {
	Running  bool
	Healthy  bool
	PID      int
	Uptime   time.Duration
	WebURL   string
	LogsPath string
	PIDPath  string
}

func (m *Manager) Status(ctx context.Context) (Status, error) {
	result := Status{
		WebURL:   m.WebURL(),
		LogsPath: m.LogsPath(),
		PIDPath:  m.PIDPath(),
	}

	pid, err := m.ReadPID()
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return result, err
		}
		healthy, healthErr := m.healthy(ctx)
		if healthErr == nil && healthy {
			result.Running = true
			result.Healthy = true
		}
		return result, nil
	}

	if !m.IsRunning(pid) {
		healthy, healthErr := m.healthy(ctx)
		if healthErr == nil && healthy {
			result.Running = true
			result.Healthy = true
			return result, nil
		}
		_ = m.RemovePID()
		return result, nil
	}

	result.Running = true
	result.PID = pid
	healthy, err := m.healthy(ctx)
	if err == nil {
		result.Healthy = healthy
	}
	if info, err := os.Stat(m.PIDPath()); err == nil {
		result.Uptime = time.Since(info.ModTime())
	}
	return result, nil
}
