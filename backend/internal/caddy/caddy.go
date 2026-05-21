package caddy

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"skyport/internal/models"

	"gorm.io/gorm"
)

// Service manages Caddy operations and Caddyfile persistence
type Service struct {
	DB            *gorm.DB
	CaddyfilePath string
	WorkspaceRoot string
}

// NewService creates a new Caddy service
func NewService(db *gorm.DB, workspaceRoot string) *Service {
	caddyfilePath := getCaddyfilePath(workspaceRoot)
	return &Service{
		DB:            db,
		CaddyfilePath: caddyfilePath,
		WorkspaceRoot: workspaceRoot,
	}
}

// getCaddyfilePath returns the appropriate Caddyfile path based on OS
func getCaddyfilePath(workspaceRoot string) string {
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		// Development/local path
		return filepath.Join(workspaceRoot, "Caddyfile")
	}
	// Production Linux path
	return "/etc/caddy/Caddyfile"
}

// GetStatus returns Caddy installation and runtime status
func (s *Service) GetStatus(ctx context.Context) (*CaddyStatus, error) {
	binary := "caddy"
	path, err := exec.LookPath(binary)
	if err != nil && runtime.GOOS == "windows" {
		// Try common Windows locations
		if p, err := findWindowsCaddy(); err == nil {
			path = p
			err = nil
		}
	}

	status := &CaddyStatus{
		Installed: err == nil,
		Path:      path,
	}

	if !status.Installed {
		return status, nil
	}

	// Get version
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, path, "version")
	out, _ := cmd.Output()
	status.Version = strings.TrimSpace(string(out))

	// Check if running (basic check via process)
	status.Running = isCaddyRunning(ctx)

	return status, nil
}

// isCaddyRunning checks if Caddy process is running
func isCaddyRunning(ctx context.Context) bool {
	binary := "caddy"
	if runtime.GOOS == "windows" {
		if p, err := findWindowsCaddy(); err == nil {
			binary = p
		}
	}

	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, binary, "list")
	err := cmd.Run()
	return err == nil
}

// findWindowsCaddy tries to find caddy binary on Windows
func findWindowsCaddy() (string, error) {
	userBin := filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local", "caddy", "caddy.exe")
	if _, err := os.Stat(userBin); err == nil {
		return userBin, nil
	}

	localBin := filepath.Join(".local", "bin", "caddy.exe")
	if _, err := os.Stat(localBin); err == nil {
		return localBin, nil
	}

	return "", fmt.Errorf("caddy not found in Windows locations")
}

// SyncCaddyfile regenerates and writes the Caddyfile from database mappings
func (s *Service) SyncCaddyfile(ctx context.Context) error {
	// Fetch all active domain mappings from database
	var mappings []models.DomainMapping
	if err := s.DB.Where("type = ?", "caddy").Find(&mappings).Error; err != nil {
		return fmt.Errorf("failed to fetch domain mappings: %w", err)
	}

	// Convert to Caddy route configs
	routes := make([]ReverseProxyConfig, 0, len(mappings))
	for _, m := range mappings {
		routes = append(routes, ReverseProxyConfig{
			Domain:    m.Domain,
			Port:      m.Port,
			EnableSSL: m.EnableSSL,
			Email:     m.Email,
		})
	}

	// Generate Caddyfile content
	content := GenerateCaddyfileContent(routes)

	// Ensure directory exists
	dir := filepath.Dir(s.CaddyfilePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create caddy directory: %w", err)
	}

	// Backup existing file if it exists
	backupPath, err := BackupCaddyfile(s.CaddyfilePath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("backup failed: %w", err)
	}

	// Write new Caddyfile
	if err := os.WriteFile(s.CaddyfilePath, []byte(content), 0o644); err != nil {
		// Restore backup if write failed
		if backupPath != "" {
			_ = RestoreCaddyfileFromBackup(backupPath, s.CaddyfilePath)
		}
		return fmt.Errorf("failed to write caddyfile: %w", err)
	}

	return nil
}

// ValidateAndReloadCaddy validates the current Caddyfile and reloads Caddy
func (s *Service) ValidateAndReloadCaddy(ctx context.Context) error {
	// Backup current config
	backupPath, err := BackupCaddyfile(s.CaddyfilePath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("backup failed: %w", err)
	}

	// Validate config
	if err := ValidateCaddyConfig(ctx, s.CaddyfilePath); err != nil {
		// Restore backup if validation fails
		if backupPath != "" {
			_ = RestoreCaddyfileFromBackup(backupPath, s.CaddyfilePath)
		}
		return err
	}

	// Reload Caddy
	if err := ReloadCaddy(ctx, s.CaddyfilePath); err != nil {
		// Restore backup if reload fails
		if backupPath != "" {
			_ = RestoreCaddyfileFromBackup(backupPath, s.CaddyfilePath)
		}
		return err
	}

	return nil
}

// GetCaddyfilePath returns the current Caddyfile path
func (s *Service) GetCaddyfilePath() string {
	return s.CaddyfilePath
}

// ReadCaddyfile reads and returns the current Caddyfile content
func (s *Service) ReadCaddyfile() (string, error) {
	content, err := os.ReadFile(s.CaddyfilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf("failed to read caddyfile: %w", err)
	}
	return string(content), nil
}
