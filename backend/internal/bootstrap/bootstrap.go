// Package bootstrap wires config → database → Fiber → modules → graceful shutdown.
//
// Startup sequence:
//  1. Load config (env + optional .env).
//  2. Open SQLite + AutoMigrate models.
//  3. Construct Fiber with production timeouts and JSON ErrorHandler.
//  4. Build app.App (container): Fiber + DB + config.
//  5. Register optional feature modules (terminal, docker, …).
//  6. api.Mount: recovery, request logging, /api/v1 routes.
//  7. Invoke each module's Register for future route/worker attachment.
//  8. Listen in a goroutine; block on SIGINT/SIGTERM.
//  9. Shutdown HTTP with timeout; close database.
package bootstrap

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/api"
	"skyport/internal/app"
	"skyport/internal/config"
	"skyport/internal/database"
	"skyport/internal/deploy"
	"skyport/internal/docker"
	"skyport/internal/filesystem"
	"skyport/internal/httperrors"
	"skyport/internal/metrics"
	"skyport/internal/projects"
	"skyport/internal/terminal"
	"skyport/internal/version"
	"skyport/internal/websocket"
)

// Run loads dependencies, serves HTTP, and blocks until shutdown completes.
func Run(cfg *config.Config) error {
	a, err := Build(cfg)
	if err != nil {
		return err
	}

	log.Printf("skyport %s starting env=%s listen=http://%s db=%s",
		version.Version, cfg.Environment, cfg.Addr(), cfg.DBPath)
	log.Printf("browser (this machine): http://127.0.0.1:%d/api/v1/health", cfg.Port)

	go func() {
		if err := a.Fiber.Listen(cfg.Addr()); err != nil {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Print("shutdown signal received, draining connections…")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := a.Fiber.ShutdownWithContext(ctx); err != nil {
		log.Printf("fiber shutdown: %v", err)
	}

	if err := database.Close(a.DB); err != nil {
		log.Printf("db close: %v", err)
	}

	log.Print("shutdown complete")
	return nil
}

// Build constructs the app container without listening—useful for integration tests.
func Build(cfg *config.Config) (*app.App, error) {
	db, err := database.Initialize(cfg)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}

	f := fiber.New(fiber.Config{
		AppName:               "SkyPort",
		ReadTimeout:           60 * time.Second,
		WriteTimeout:          60 * time.Second,
		IdleTimeout:           120 * time.Second,
		DisableStartupMessage: true,
		ErrorHandler:          httperrors.FiberErrorHandler,
	})

	container := &app.App{
		Fiber:  f,
		DB:     db,
		Config: cfg,
	}

	// Stub modules: expand Register() to mount routes or background workers.
	container.RegisterModule(&terminal.Module{})
	container.RegisterModule(metrics.NewModule(cfg.MetricsDiskPath))
	container.RegisterModule(&docker.Module{})
	container.RegisterModule(&websocket.Module{})
	container.RegisterModule(&deploy.Module{})
	container.RegisterModule(&filesystem.Module{})
	container.RegisterModule(&projects.Module{})

	api.Mount(container)

	for _, m := range container.Modules {
		if err := m.Register(container); err != nil {
			return nil, fmt.Errorf("module %q: %w", m.Name(), err)
		}
	}

	return container, nil
}
