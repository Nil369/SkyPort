//go:build linux

package daemon

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
)

// SystemdManager implements ServiceManager for Linux using systemd.
type SystemdManager struct {
	serviceName string
	unitPath    string
}

// NewSystemdManager creates a systemd-based service manager for Linux.
func NewSystemdManager() ServiceManager {
	return &SystemdManager{
		serviceName: "skyport",
		unitPath:    "/etc/systemd/system/skyport.service",
	}
}

// Install creates and enables a systemd service unit file.
func (s *SystemdManager) Install(ctx context.Context, binaryPath, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	s.serviceName = serviceName
	s.unitPath = filepath.Join("/etc/systemd/system", serviceName+".service")

	if !isRoot() {
		return fmt.Errorf("systemd service installation requires root privileges")
	}

	if err := s.generateUnitFile(binaryPath, serviceName); err != nil {
		return fmt.Errorf("failed to generate unit file: %w", err)
	}

	if err := s.reloadSystemd(); err != nil {
		return fmt.Errorf("systemctl daemon-reload failed: %w", err)
	}

	if err := s.Enable(ctx, serviceName); err != nil {
		return fmt.Errorf("failed to enable service: %w", err)
	}

	return nil
}

// Uninstall disables and removes the systemd service.
func (s *SystemdManager) Uninstall(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}

	if !isRoot() {
		return fmt.Errorf("systemd service removal requires root privileges")
	}

	_ = s.systemctl("disable", serviceName)
	_ = os.Remove(s.unitPath)

	return s.reloadSystemd()
}

// Start launches the systemd service.
func (s *SystemdManager) Start(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	return s.systemctl("start", serviceName)
}

// Stop halts the systemd service gracefully.
func (s *SystemdManager) Stop(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	return s.systemctl("stop", serviceName)
}

// Restart restarts the systemd service.
func (s *SystemdManager) Restart(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	return s.systemctl("restart", serviceName)
}

// Status returns the current systemd service status.
func (s *SystemdManager) Status(ctx context.Context, serviceName string) (ServiceStatus, error) {
	if serviceName == "" {
		serviceName = s.serviceName
	}

	cmd := exec.CommandContext(ctx, "systemctl", "is-active", serviceName)
	output, _ := cmd.Output()
	isActive := strings.TrimSpace(string(output)) == "active"

	// Get PID if running
	var pid int
	if isActive {
		pidCmd := exec.CommandContext(ctx, "systemctl", "show", "-p", "MainPID", "--value", serviceName)
		pidOut, _ := pidCmd.Output()
		fmt.Sscanf(strings.TrimSpace(string(pidOut)), "%d", &pid)
	}

	// Check if enabled
	enableCmd := exec.CommandContext(ctx, "systemctl", "is-enabled", serviceName)
	enableOutput, _ := enableCmd.Output()
	enabled := strings.TrimSpace(string(enableOutput)) == "enabled"

	return ServiceStatus{
		Running: isActive,
		PID:     pid,
		Enabled: enabled,
		Status:  strings.TrimSpace(string(output)),
		Error:   "",
	}, nil
}

// Enable marks the service for auto-start on boot.
func (s *SystemdManager) Enable(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	return s.systemctl("enable", serviceName)
}

// Disable prevents auto-start on boot.
func (s *SystemdManager) Disable(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = s.serviceName
	}
	return s.systemctl("disable", serviceName)
}

// generateUnitFile creates the systemd service unit file.
func (s *SystemdManager) generateUnitFile(binaryPath, serviceName string) error {
	description := "SkyPort Backend Server"
	if serviceName != "skyport" {
		description = fmt.Sprintf("SkyPort (%s)", serviceName)
	}

	unitContent := fmt.Sprintf(`[Unit]
Description=%s
Documentation=https://docs.skyport.akashhalder.in
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=skyport
Group=skyport
WorkingDirectory=/opt/skyport

ExecStart=%s
Restart=always
RestartSec=5
StandardOutput=append:/opt/skyport/logs/skyport.log
StandardError=append:/opt/skyport/logs/skyport.log

# Environment
Environment="SKYPORT_ENV=production"
Environment="SKYPORT_LOG_LEVEL=info"
Environment="GIN_MODE=release"
Environment="SKYPORT_HOST=0.0.0.0"
Environment="SKYPORT_PORT=8080"

# Security hardening
PrivateTmp=yes
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/skyport

# Resource limits
LimitNOFILE=65536
LimitNPROC=65536

# Timeouts
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
`, description, binaryPath)

	if err := os.WriteFile(s.unitPath, []byte(unitContent), 0o644); err != nil {
		return err
	}

	return nil
}

// reloadSystemd reloads the systemd configuration.
func (s *SystemdManager) reloadSystemd() error {
	return s.systemctl("daemon-reload")
}

// systemctl executes a systemctl command.
func (s *SystemdManager) systemctl(args ...string) error {
	cmd := exec.Command("systemctl", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl %s: %w\n%s", strings.Join(args, " "), err, string(output))
	}
	return nil
}

func isRoot() bool {
	currentUser, err := user.Current()
	if err != nil {
		return false
	}
	return currentUser.Uid == "0"
}
