package app

import (
	"context"
	"log"
	"os"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"skyport/internal/config"
)

// MetricsProvider is implemented by *metrics.Service without importing metrics here
// (avoids package cycles). Snapshot returns a JSON-serializable value, typically *HostSnapshot.
type MetricsProvider interface {
	Snapshot(ctx context.Context) (any, error)
}

// Module is implemented by feature packages (terminal, docker, …)
// to plug routes or background workers into the same lifecycle
// without import cycles.
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
	Logger  *log.Logger
}

// New creates the application container.
func New(
	f *fiber.App,
	db *gorm.DB,
	cfg *config.Config,
) *App {
	return &App{
		Fiber:  f,
		DB:     db,
		Config: cfg,
		Modules: make([]Module, 0),
		Logger: log.New(
			os.Stdout,
			"[skyport] ",
			log.LstdFlags|log.Lshortfile,
		),
	}
}

// RegisterModule appends a module for bootstrap initialization.
func (a *App) RegisterModule(m Module) {
	if m == nil {
		return
	}

	a.Modules = append(a.Modules, m)

	if a.Logger != nil {
		a.Logger.Printf("registered module: %s", m.Name())
	}
}