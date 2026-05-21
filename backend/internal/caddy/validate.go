package caddy

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ValidateCaddyConfig validates a Caddyfile without reloading
func ValidateCaddyConfig(ctx context.Context, caddyfilePath string) error {
	binary := "caddy"
	if runtime.GOOS == "windows" {
		// Try to find caddy in PATH on Windows
		if path, err := exec.LookPath("caddy"); err == nil {
			binary = path
		}
	}

	// Create a timeout context if none exists
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
	}

	// Run: caddy validate --config /path/to/Caddyfile
	cmd := exec.CommandContext(ctx, binary, "validate", "--config", caddyfilePath)
	output, err := cmd.CombinedOutput()

	if err != nil {
		// Parse validation error
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("caddyfile validation failed: %s", errMsg)
	}

	return nil
}

// ValidateDomainName validates domain name format (basic check)
func ValidateDomainName(domain string) error {
	domain = NormalizeDomain(domain)

	if domain == "" {
		return fmt.Errorf("domain cannot be empty")
	}

	if len(domain) > 255 {
		return fmt.Errorf("domain name too long (max 255 characters)")
	}

	// Basic domain validation - must contain at least one dot and valid chars
	if !strings.Contains(domain, ".") && domain != "localhost" {
		return fmt.Errorf("domain must be fully qualified (e.g., example.com)")
	}

	// Check for invalid characters (very basic)
	for _, ch := range domain {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '_' || ch == '*') {
			return fmt.Errorf("domain contains invalid character: %c", ch)
		}
	}

	return nil
}

// ValidatePort validates port number
func ValidatePort(port int) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port: %d (must be 1-65535)", port)
	}
	return nil
}

// ValidateReverseProxyConfig validates a complete proxy configuration
func ValidateReverseProxyConfig(cfg ReverseProxyConfig) error {
	if err := ValidateDomainName(cfg.Domain); err != nil {
		return fmt.Errorf("invalid domain: %w", err)
	}

	if err := ValidatePort(cfg.Port); err != nil {
		return fmt.Errorf("invalid port: %w", err)
	}

	if cfg.EnableSSL && cfg.Email != "" {
		if !strings.Contains(cfg.Email, "@") {
			return fmt.Errorf("invalid email format for SSL: %s", cfg.Email)
		}
	}

	return nil
}
