// Package bootstrap wires config → database → Fiber → modules → graceful shutdown.
//
// Startup sequence:
//  1. Load config (env + optional .env).
//  2. Open SQLite + AutoMigrate models.
//  3. Construct Fiber with production timeouts and JSON ErrorHandler.
//  4. Build app.App (container): Fiber + DB + config.
//  5. Register optional feature modules (terminal, docker, …).
//  6. api.Mount: recovery, request logging, GET /api, /api/v1, /docs.
//  7. Invoke each module's Register for future route/worker attachment.
//  8. Listen in a goroutine; block on SIGINT/SIGTERM.
//  9. Shutdown HTTP with timeout; close database.
package bootstrap

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"

	docs "skyport/internal/docs"

	"skyport/internal/access"
	"skyport/internal/agent"
	"skyport/internal/api"
	"skyport/internal/app"
	"skyport/internal/audit"
	"skyport/internal/capabilities"
	"skyport/internal/cluster"
	"skyport/internal/config"
	"skyport/internal/database"
	"skyport/internal/deployments"
	"skyport/internal/docker"
	"skyport/internal/filesystem"
	"skyport/internal/frontend"
	"skyport/internal/httperrors"
	"skyport/internal/marketplace"
	"skyport/internal/metrics"
	"skyport/internal/orchestrator"
	"skyport/internal/projects"
	"skyport/internal/proxy"
	"skyport/internal/runtime"
	"skyport/internal/startup"
	"skyport/internal/system"
	"skyport/internal/terminal"
	"skyport/internal/users"
	"skyport/internal/websocket"
)

// Run loads dependencies, serves HTTP, and blocks until shutdown completes.
func Run(cfg *config.Config) error {
	started := time.Now()
	a, err := Build(cfg)
	if err != nil {
		return err
	}

	baseURL := displayListenURL(cfg)
	startup.PrintSplash(os.Stdout, time.Since(started), startup.Options{
		Environment:      cfg.Environment,
		AddrHTTP:         cfg.Addr(),
		BaseURL:          baseURL,
		EmbeddedFrontend: embeddedDistReady(),
		SQLiteOK:         a.DB != nil,
		WebSocketHubOK:   true,
		ModulesOK:        true,
		DockerOK:         cfg.EnableDocker,
		EnableTerminal:   cfg.EnableTerminal,
		EnableMetrics:    cfg.EnableMetrics,
	})

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
	cfg.AllowedOrigins = mergeAllowedOrigins(cfg)

	db, err := database.Initialize(cfg)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}

	if err := access.Bootstrap(db); err != nil {
		return nil, fmt.Errorf("rbac bootstrap: %w", err)
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

	docs.SwaggerInfo.Host = swaggerHost(cfg)
	docs.SwaggerInfo.BasePath = "/"
	docs.SwaggerInfo.Schemes = []string{"http"}

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
	container.RegisterModule(&capabilities.Module{})
	container.RegisterModule(&runtime.Module{})
	container.RegisterModule(deployments.NewModule())
	container.RegisterModule(&proxy.Module{})
	container.RegisterModule(&orchestrator.Module{})
	container.RegisterModule(&users.Module{})
	container.RegisterModule(&audit.Module{})
	container.RegisterModule(&marketplace.Module{})
	container.RegisterModule(&cluster.Module{})
	container.RegisterModule(&agent.Module{})
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

	// Embedded React SPA: register last so /api, /api/v1, /docs, /ws stay authoritative.
	frontend.Mount(container)

	return container, nil
}

func swaggerHost(cfg *config.Config) string {
	if raw := strings.TrimSpace(cfg.PublicURL); raw != "" {
		if parsed, err := url.Parse(raw); err == nil && parsed.Host != "" {
			return parsed.Host
		}
	}
	host := strings.TrimSpace(cfg.Host)
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("%s:%d", host, cfg.Port)
}

func displayListenURL(cfg *config.Config) string {
	host := strings.TrimSpace(cfg.Host)
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "localhost"
	}
	return fmt.Sprintf("http://%s:%d", host, cfg.Port)
}

func mergeAllowedOrigins(cfg *config.Config) []string {
	origins := make([]string, 0, len(cfg.AllowedOrigins)+3)
	seen := map[string]struct{}{}
	add := func(origin string) {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			return
		}
		if _, ok := seen[origin]; ok {
			return
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}

	for _, origin := range cfg.AllowedOrigins {
		add(origin)
	}

	if raw := strings.TrimSpace(cfg.PublicURL); raw != "" {
		add(raw)
		return origins
	}

	host := strings.TrimSpace(cfg.Host)
	switch host {
	case "", "0.0.0.0", "::":
		add(fmt.Sprintf("http://localhost:%d", cfg.Port))
		add(fmt.Sprintf("http://127.0.0.1:%d", cfg.Port))
	default:
		add(fmt.Sprintf("http://%s:%d", host, cfg.Port))
	}

	return origins
}

func embeddedDistReady() bool {
	_, err := frontend.Dist.Open("dist/index.html")
	return err == nil
}
