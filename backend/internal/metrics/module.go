// Package metrics exposes host metrics over REST and WebSocket for realtime dashboards.
//
// Architecture:
//   - Service (gopsutil) = collection
//   - Handlers = transport (HTTP / WS)
//   - Module.Register wires routes and assigns app.Metrics for other features later
//
// Extending: add ContainerCollector / ProcessCollector interfaces composed into Service
// or a Facade that merges HostSnapshot with extra blocks before encode.
package metrics

import (
	"log"

	"skyport/internal/app"
)

// Module wires metrics routes into the App. Create with NewModule().
type Module struct {
	svc *Service
}

// NewModule builds a metrics module. diskPath may be empty to use the OS default root.
func NewModule(diskPath string) *Module {
	return &Module{svc: NewService(diskPath)}
}

// Name implements app.Module.
func (m *Module) Name() string { return "metrics" }

// Register attaches REST + WebSocket handlers and publishes the service on App.Metrics.
func (m *Module) Register(a *app.App) error {
	a.Metrics = m.svc
	registerHTTP(a)
	registerWebSocket(a)
	log.Print("metrics: GET /api/v1/metrics | WebSocket /ws/metrics (push every 2s)")
	return nil
}
