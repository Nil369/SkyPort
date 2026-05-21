package caddy

import "time"

// ReverseProxyConfig represents a reverse proxy route configuration
type ReverseProxyConfig struct {
	Domain    string
	Port      int
	EnableSSL bool
	Email     string
}

// CaddyStatus represents Caddy installation and runtime status
type CaddyStatus struct {
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Version   string `json:"version"`
	Path      string `json:"path,omitempty"`
}

// CaddyConfig represents the complete Caddyfile configuration
type CaddyConfig struct {
	Routes      []ReverseProxyConfig
	GeneratedAt time.Time
	BackupPath  string
}

// ConfigValidationError represents validation issues in a config
type ConfigValidationError struct {
	Reason  string
	Details string
}
