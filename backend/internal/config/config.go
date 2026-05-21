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
	Host            string
	Port            int
	PublicURL       string // optional, for future webhooks / links
	DBPath          string
	WorkspaceRoot   string
	Environment     string // development | production
	LogLevel        string // debug | info | warn | error
	ShutdownTimeout time.Duration
	JWTSecret       string
	JWTExpires      time.Duration
	// AllowedOrigins lists permitted CORS origins. Use "*" to allow all origins (use with caution!).
	// Examples: "http://localhost:3000,https://example.com" or "*" for public APIs.
	AllowedOrigins   []string
	TrustedProxies   []string
	EnableTerminal   bool
	EnableMetrics    bool
	EnableDocker     bool
	EnableFilesystem bool
	EnableProjects   bool
	// MetricsDiskPath is optional: gopsutil disk.Usage path (e.g. / or C:\). Empty = OS default.
	MetricsDiskPath string

	// OpenRegistration allows POST /auth/register when at least one user already exists.
	// Disable in production to enforce invite-only onboarding.
	OpenRegistration bool

	// EncryptionKey is used for AES-256 encryption of sensitive data (SSH keys, passwords).
	// Must be 16, 24, or 32 bytes when base64 decoded.
	EncryptionKey string
	// GitHubWebhookSecret optionally validates incoming GitHub webhook signatures
	GitHubWebhookSecret string
	GitHubAppID         string
	GitHubAppName       string
	GitHubAppSlug       string
	GitHubPrivateKey    string
	GitHubAppPrivateKey string
	GitHubAPIBaseURL    string
	GitHubWebBaseURL    string
	GitHubBridgeURL     string
	FrontendURL         string
}

// Load reads .env when present (local dev), then environment variables.
// Required for twelve-factor style deploys; .env is optional convenience.
// Searches for .env in: current directory, installation directory (Windows), and /etc/skyport (Linux/macOS).
func Load() (*Config, error) {
	// Search for .env in common install locations
	envPaths := []string{
		".env",                             // Current directory (local dev)
		"C:\\Program Files\\SkyPort\\.env", // Windows install dir
		"/opt/skyport/.env",                // Linux install dir
		"/usr/local/skyport/.env",          // Linux alternate
		"/usr/local/opt/skyport/.env",      // macOS install dir
		"${HOME}/SkyPort/.env",             // User home (macOS/Linux)
	}

	// Try to load .env from all known paths (ignore errors)
	for _, path := range envPaths {
		if err := godotenv.Load(path); err == nil {
			break // Successfully loaded from this path
		}
		// Continue to next path on error
	}

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
		Host:                getEnv("SKYPORT_HOST", "0.0.0.0"),
		Port:                port,
		PublicURL:           os.Getenv("SKYPORT_PUBLIC_URL"),
		DBPath:              getEnv("SKYPORT_DB_PATH", "./data/skyport.db"),
		WorkspaceRoot:       getEnv("SKYPORT_WORKSPACE_ROOT", "./workspace"),
		Environment:         getEnv("SKYPORT_ENV", "production"),
		LogLevel:            getEnv("SKYPORT_LOG_LEVEL", "info"),
		ShutdownTimeout:     time.Duration(shutdownSec) * time.Second,
		JWTSecret:           getEnv("JWT_SECRET", "change-me-in-production__super_secret_jwt."),
		JWTExpires:          time.Duration(jwtExpiresSec) * time.Second,
		AllowedOrigins:      splitCSV(getEnv("ALLOWED_ORIGINS", "*")), // Allow all domains (http and https) by default. Override with comma-separated list to restrict.
		TrustedProxies:      splitCSV(getEnv("TRUSTED_PROXIES", "127.0.0.1,::1")),
		EnableTerminal:      getBoolEnv("ENABLE_TERMINAL", true),
		EnableMetrics:       getBoolEnv("ENABLE_METRICS", true),
		EnableDocker:        getBoolEnv("ENABLE_DOCKER", true),
		EnableFilesystem:    getBoolEnv("ENABLE_FILESYSTEM", true),
		EnableProjects:      getBoolEnv("ENABLE_PROJECTS", true),
		MetricsDiskPath:     getEnv("SKYPORT_METRICS_DISK_PATH", ""),
		OpenRegistration:    getBoolEnv("SKYPORT_OPEN_REGISTRATION", true),
		EncryptionKey:       getEnv("SKYPORT_ENCRYPTION_KEY", "uE8+7Fq3H+vW9O8X/pY5ZQ=="), // Default for dev, should be changed in prod
		GitHubWebhookSecret: getEnv("GITHUB_WEBHOOK_SECRET", ""),
		GitHubAppID:         getEnv("GITHUB_APP_ID", getEnv("APP_ID", "")),
		GitHubAppName:       getEnv("GITHUB_APP_NAME", "SkyPort"),
		GitHubAppSlug:       getEnv("GITHUB_APP_SLUG", "skyportdeploy"),
		GitHubPrivateKey:    getEnv("GITHUB_PRIVATE_KEY", getEnv("APP_PRIVATE_KEY", "")),
		GitHubAppPrivateKey: getEnv("GITHUB_APP_PRIVATE_KEY", getEnv("APP_PRIVATE_KEY", "")),
		GitHubAPIBaseURL:    getEnv("GITHUB_API_BASE_URL", "https://api.github.com"),
		GitHubWebBaseURL:    getEnv("GITHUB_WEB_BASE_URL", "https://github.com"),
		GitHubBridgeURL:     getEnv("GITHUB_BRIDGE_URL", "https://skyport.akashhalder.in"),
		FrontendURL:         getEnv("SKYPORT_FRONTEND_URL", "*"),
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
