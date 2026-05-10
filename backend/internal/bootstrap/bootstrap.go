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
	"skyport/internal/system"
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

	log.Printf("==============================================")
	log.Printf(" SkyPort API %s", version.Version)
	log.Printf(" env=%s listen=http://%s db=%s", cfg.Environment, cfg.Addr(), cfg.DBPath)
	log.Printf(" modules: terminal=%t metrics=%t docker=%t filesystem=%t projects=%t",
		cfg.EnableTerminal, cfg.EnableMetrics, cfg.EnableDocker, cfg.EnableFilesystem, cfg.EnableProjects)
	log.Printf(" routes: GET / | GET /api/v1/health | GET /api/v1/system/info | WS /ws/terminal | WS /ws/metrics")
	log.Printf("==============================================")

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
		AppName:                 "SkyPort",
		BodyLimit:               4 * 1024 * 1024,
		ReadTimeout:             60 * time.Second,
		WriteTimeout:            60 * time.Second,
		IdleTimeout:             120 * time.Second,
		EnableTrustedProxyCheck: true,
		TrustedProxies:          cfg.TrustedProxies,
		DisableStartupMessage:   true,
		ErrorHandler:            httperrors.FiberErrorHandler,
	})

	container := &app.App{
		Fiber:  f,
		DB:     db,
		Config: cfg,
	}

	container.RegisterModule(&websocket.Module{})
	if cfg.EnableTerminal {
		container.RegisterModule(&terminal.Module{})
	}
	if cfg.EnableMetrics {
		container.RegisterModule(metrics.NewModule(cfg.MetricsDiskPath))
	}
	if cfg.EnableDocker {
		container.RegisterModule(&docker.Module{})
	}
	container.RegisterModule(&system.Module{})
	container.RegisterModule(&deploy.Module{})
	if cfg.EnableFilesystem {
		container.RegisterModule(&filesystem.Module{})
	}
	if cfg.EnableProjects {
		container.RegisterModule(&projects.Module{})
	}

	api.Mount(container)

	for _, m := range container.Modules {
		if err := m.Register(container); err != nil {
			return nil, fmt.Errorf("module %q: %w", m.Name(), err)
		}
	}

	return container, nil
}
