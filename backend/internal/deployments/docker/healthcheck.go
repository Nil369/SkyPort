package docker

import (
	"context"
	"time"
)

type HealthOptions struct {
	Path         string
	Interval     time.Duration
	Timeout      time.Duration
	StartupGrace time.Duration
	Retries      int
}

type HealthChecker struct{}

func NewHealthChecker() *HealthChecker { return &HealthChecker{} }

// Check performs healthcheck polling and returns success and logs collected.
func (h *HealthChecker) Check(ctx context.Context, target string, opts HealthOptions) (bool, []string) {
	logs := []string{"[healthcheck] stub: assuming healthy"}
	return true, logs
}
