package caddy

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ReloadCaddy reloads Caddy with the new configuration
// It validates the config first, then reloads if valid
func ReloadCaddy(ctx context.Context, caddyfilePath string) error {
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
		ctx, cancel = context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
	}

	// First validate
	if err := ValidateCaddyConfig(ctx, caddyfilePath); err != nil {
		return fmt.Errorf("caddyfile validation failed before reload: %w", err)
	}

	// Then reload
	cmd := exec.CommandContext(ctx, binary, "reload", "--config", caddyfilePath)
	output, err := cmd.CombinedOutput()

	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("caddy reload failed: %s", errMsg)
	}

	return nil
}

// StopCaddy stops the Caddy service
func StopCaddy(ctx context.Context) error {
	binary := "caddy"
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("caddy"); err == nil {
			binary = path
		}
	}

	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, binary, "stop")
	output, err := cmd.CombinedOutput()

	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("caddy stop failed: %s", errMsg)
	}

	return nil
}

// StartCaddy starts the Caddy service with the given config
func StartCaddy(ctx context.Context, caddyfilePath string) error {
	binary := "caddy"
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("caddy"); err == nil {
			binary = path
		}
	}

	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, binary, "start", "--config", caddyfilePath, "--watch")
	output, err := cmd.CombinedOutput()

	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("caddy start failed: %s", errMsg)
	}

	return nil
}

// BackupCaddyfile creates a backup of the current Caddyfile
func BackupCaddyfile(caddyfilePath string) (string, error) {
	// Read current file
	content, err := os.ReadFile(caddyfilePath)
	if err != nil {
		if os.IsNotExist(err) {
			// No existing file, no backup needed
			return "", nil
		}
		return "", fmt.Errorf("failed to read caddyfile for backup: %w", err)
	}

	// Create backup path with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := caddyfilePath + ".backup." + timestamp

	// Write backup
	if err := os.WriteFile(backupPath, content, 0o644); err != nil {
		return "", fmt.Errorf("failed to create caddyfile backup: %w", err)
	}

	return backupPath, nil
}

// RestoreCaddyfileFromBackup restores a Caddyfile from backup
func RestoreCaddyfileFromBackup(backupPath, targetPath string) error {
	content, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("failed to read backup file: %w", err)
	}

	if err := os.WriteFile(targetPath, content, 0o644); err != nil {
		return fmt.Errorf("failed to restore caddyfile: %w", err)
	}

	return nil
}
