// Package config loads runtime settings from the environment.
//
// Architecture: SkyPort keeps configuration flat and explicit (env vars only) so a
// single binary can run on any VPS with zero secrets baked in. A future Pro tier can
// add file-based overrides without changing call sites—Load() remains the only entry.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all process-wide settings. Keep fields pointer-free where possible
// so the App container can copy or pass by value safely for read-only handlers.
type Config struct {
	Host             string
	Port             int
	PublicURL        string // optional, for future webhooks / links
	DBPath           string
	WorkspaceRoot    string
	Environment      string // development | production
	LogLevel         string // debug | info | warn | error
	ShutdownTimeout  time.Duration
	JWTSecret        string
	JWTExpires       time.Duration
	AllowedOrigins   []string
	TrustedProxies   []string
	EnableTerminal   bool
	EnableMetrics    bool
	EnableDocker     bool
	EnableFilesystem bool
	EnableProjects   bool
	// MetricsDiskPath is optional: gopsutil disk.Usage path (e.g. / or C:\). Empty = OS default.
	MetricsDiskPath string
}

// Load reads .env when present (local dev), then environment variables.
// Required for twelve-factor style deploys; .env is optional convenience.
func Load() (*Config, error) {
	// Best-effort: ignore missing .env in production.
	_ = godotenv.Load()

	port, err := strconv.Atoi(getEnv("SKYPORT_PORT", "8080"))
	if err != nil {
		return nil, fmt.Errorf("SKYPORT_PORT: %w", err)
	}

	shutdownSec, err := strconv.Atoi(getEnv("SKYPORT_SHUTDOWN_TIMEOUT_SEC", "10"))
	if err != nil {
		return nil, fmt.Errorf("SKYPORT_SHUTDOWN_TIMEOUT_SEC: %w", err)
	}
	jwtExpiresSec, err := strconv.Atoi(getEnv("JWT_EXPIRES", "604800"))
	if err != nil {
		return nil, fmt.Errorf("JWT_EXPIRES: %w", err)
	}

	cfg := &Config{
		Host:             getEnv("SKYPORT_HOST", "0.0.0.0"),
		Port:             port,
		PublicURL:        os.Getenv("SKYPORT_PUBLIC_URL"),
		DBPath:           getEnv("SKYPORT_DB_PATH", "./data/skyport.db"),
		WorkspaceRoot:    getEnv("SKYPORT_WORKSPACE_ROOT", "./workspace"),
		Environment:      getEnv("SKYPORT_ENV", "development"),
		LogLevel:         getEnv("SKYPORT_LOG_LEVEL", "info"),
		ShutdownTimeout:  time.Duration(shutdownSec) * time.Second,
		JWTSecret:        getEnv("JWT_SECRET", "change-me-in-production"),
		JWTExpires:       time.Duration(jwtExpiresSec) * time.Second,
		AllowedOrigins:   splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")),
		TrustedProxies:   splitCSV(getEnv("TRUSTED_PROXIES", "127.0.0.1,::1")),
		EnableTerminal:   getBoolEnv("ENABLE_TERMINAL", true),
		EnableMetrics:    getBoolEnv("ENABLE_METRICS", true),
		EnableDocker:     getBoolEnv("ENABLE_DOCKER", true),
		EnableFilesystem: getBoolEnv("ENABLE_FILESYSTEM", true),
		EnableProjects:   getBoolEnv("ENABLE_PROJECTS", true),
		MetricsDiskPath:  getEnv("SKYPORT_METRICS_DISK_PATH", ""),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	if c.Port <= 0 || c.Port > 65535 {
		return fmt.Errorf("invalid SKYPORT_PORT: %d", c.Port)
	}
	if c.DBPath == "" {
		return fmt.Errorf("SKYPORT_DB_PATH is required")
	}
	if c.WorkspaceRoot == "" {
		return fmt.Errorf("SKYPORT_WORKSPACE_ROOT is required")
	}
	switch c.Environment {
	case "development", "production", "test":
	default:
		return fmt.Errorf("SKYPORT_ENV must be development, production, or test")
	}
	if c.JWTExpires <= 0 {
		return fmt.Errorf("JWT_EXPIRES must be > 0")
	}
	if c.Environment == "production" && len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters in production")
	}
	return nil
}

// Addr returns host:port for Fiber's Listen.
func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		// .env on Windows sometimes leaves quotes; strip so Atoi("8090") works.
		return strings.Trim(strings.TrimSpace(v), `"'`)
	}
	return fallback
}

func getBoolEnv(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(getEnv(key, strconv.FormatBool(fallback))))
	switch raw {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func splitCSV(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		s := strings.TrimSpace(p)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}
