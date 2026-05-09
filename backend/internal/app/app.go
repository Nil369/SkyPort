// Package app defines the central application container (dependency injection root).
//
// Architecture: Handlers and future modules receive *app.App (or narrower interfaces)
// instead of global singletons. This keeps SkyPort testable and lets Pro/Enterprise
// features register optional services without rewriting bootstrap.
package app

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"skyport/internal/config"
)

// MetricsProvider is implemented by *metrics.Service without importing metrics here
// (avoids package cycles). Snapshot returns a JSON-serializable value, typically *HostSnapshot.
type MetricsProvider interface {
	Snapshot(ctx context.Context) (any, error)
}

// Module is implemented by feature packages (terminal, docker, …) to plug routes
// or background workers into the same lifecycle without import cycles.
type Module interface {
	Name() string
	Register(a *App) error
}

// App is the root container created once at startup.
type App struct {
	Fiber   *fiber.App
	DB      *gorm.DB
	Config  *config.Config
	Metrics MetricsProvider
	Modules []Module
}

// RegisterModule appends a module for bootstrap to initialize in order.
func (a *App) RegisterModule(m Module) {
	if m == nil {
		return
	}
	a.Modules = append(a.Modules, m)
}
