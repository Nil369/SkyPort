package testutil

import (
	"path/filepath"
	"testing"
	"time"

	"skyport/internal/app"
	"skyport/internal/bootstrap"
	"skyport/internal/config"
	"skyport/internal/database"
)

func BuildTestApp(t *testing.T) *app.App {
	t.Helper()
	cfg := &config.Config{
		Host:             "127.0.0.1",
		Port:             0,
		DBPath:           filepath.Join(t.TempDir(), "test.db"),
		WorkspaceRoot:    t.TempDir(),
		Environment:      "test",
		LogLevel:         "error",
		ShutdownTimeout:  3 * time.Second,
		JWTSecret:        "test-secret-test-secret-test-secret",
		JWTExpires:       time.Hour,
		AllowedOrigins:   []string{"http://localhost:3000"},
		TrustedProxies:   []string{"127.0.0.1"},
		EnableTerminal:   false,
		EnableMetrics:    true,
		EnableDocker:     false,
		EnableFilesystem: true,
		EnableProjects:   true,
	}
	app, err := bootstrap.Build(cfg)
	if err != nil {
		t.Fatalf("build app: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close(app.DB)
	})
	return app
}
