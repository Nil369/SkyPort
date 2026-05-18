//go:build darwin

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

// LaunchdManager implements ServiceManager for macOS using launchd.
type LaunchdManager struct {
	serviceName string
	plistPath   string
}

// NewLaunchdManager creates a launchd-based service manager for macOS.
func NewLaunchdManager() ServiceManager {
	return &LaunchdManager{
		serviceName: "in.skyport.server",
		plistPath:   filepath.Join(os.Getenv("HOME"), "Library/LaunchAgents/in.skyport.server.plist"),
	}
}

// Install creates and enables a launchd plist file.
func (l *LaunchdManager) Install(ctx context.Context, binaryPath, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}
	l.serviceName = serviceName

	// Determine plist location: system-wide or user-level
	if macOSIsRootUser() {
		l.plistPath = filepath.Join("/Library/LaunchDaemons", serviceName+".plist")
	} else {
		home, _ := os.UserHomeDir()
		l.plistPath = filepath.Join(home, "Library/LaunchAgents", serviceName+".plist")
	}

	// Create parent directory
	dir := filepath.Dir(l.plistPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create plist directory: %w", err)
	}

	// Generate plist content
	plistContent := l.generatePlist(serviceName, binaryPath)
	if err := os.WriteFile(l.plistPath, []byte(plistContent), 0o644); err != nil {
		return fmt.Errorf("failed to write plist: %w", err)
	}

	// Load the service
	if err := l.Load(); err != nil {
		_ = os.Remove(l.plistPath)
		return err
	}

	return nil
}

// Uninstall removes and unloads the launchd service.
func (l *LaunchdManager) Uninstall(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}

	_ = l.Unload()
	_ = os.Remove(l.plistPath)
	return nil
}

// Start launches the launchd service.
func (l *LaunchdManager) Start(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}

	cmd := exec.Command("launchctl", "start", serviceName)
	if output, err := cmd.CombinedOutput(); err != nil {
		// launchctl start may return non-zero if already running
		if !strings.Contains(string(output), "already running") && !strings.Contains(string(output), "Service is already loaded") {
			return fmt.Errorf("launchctl start failed: %w\n%s", err, string(output))
		}
	}
	return nil
}

// Stop halts the launchd service.
func (l *LaunchdManager) Stop(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}

	cmd := exec.Command("launchctl", "stop", serviceName)
	if output, err := cmd.CombinedOutput(); err != nil {
		// launchctl stop may return non-zero if not running
		if !strings.Contains(string(output), "No such process") && !strings.Contains(string(output), "not loaded") {
			return fmt.Errorf("launchctl stop failed: %w\n%s", err, string(output))
		}
	}
	return nil
}

// Restart stops and starts the launchd service.
func (l *LaunchdManager) Restart(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}

	_ = l.Stop(ctx, serviceName)
	return l.Start(ctx, serviceName)
}

// Status returns the current launchd service status.
func (l *LaunchdManager) Status(ctx context.Context, serviceName string) (ServiceStatus, error) {
	if serviceName == "" {
		serviceName = l.serviceName
	}

	// Check if plist is loaded
	cmd := exec.Command("launchctl", "list", serviceName)
	output, _ := cmd.Output()
	isLoaded := len(output) > 0 && !strings.Contains(string(output), "No such process")

	// Try to get PID from launchctl list
	var pid int
	if isLoaded {
		// launchctl list output includes PID as first field
		fields := strings.Fields(string(output))
		if len(fields) > 0 && fields[0] != "-" {
			fmt.Sscanf(fields[0], "%d", &pid)
		}
	}

	return ServiceStatus{
		Running: pid > 0,
		PID:     pid,
		Enabled: isLoaded,
		Status:  statusValue(pid > 0),
		Error:   "",
	}, nil
}

// Enable marks the service for auto-start (load at boot).
func (l *LaunchdManager) Enable(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}
	return l.Load()
}

// Disable prevents auto-start on boot (unload).
func (l *LaunchdManager) Disable(ctx context.Context, serviceName string) error {
	if serviceName == "" {
		serviceName = l.serviceName
	}
	return l.Unload()
}

// Load registers the service with launchd.
func (l *LaunchdManager) Load() error {
	cmd := exec.Command("launchctl", "load", l.plistPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		// launchctl load returns non-zero if already loaded
		if !strings.Contains(string(output), "already loaded") {
			return fmt.Errorf("launchctl load failed: %w\n%s", err, string(output))
		}
	}
	return nil
}

// Unload unregisters the service from launchd.
func (l *LaunchdManager) Unload() error {
	cmd := exec.Command("launchctl", "unload", l.plistPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		// launchctl unload returns non-zero if not loaded
		if !strings.Contains(string(output), "not loaded") {
			return fmt.Errorf("launchctl unload failed: %w\n%s", err, string(output))
		}
	}
	return nil
}

// generatePlist creates the launchd plist content for the service.
func (l *LaunchdManager) generatePlist(serviceName, binaryPath string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
	</array>
	<key>WorkingDirectory</key>
	<string>/opt/skyport</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>StandardOutPath</key>
	<string>/opt/skyport/logs/skyport.log</string>
	<key>StandardErrorPath</key>
	<string>/opt/skyport/logs/skyport.log</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>SKYPORT_ENV</key>
		<string>production</string>
		<key>SKYPORT_LOG_LEVEL</key>
		<string>info</string>
		<key>SKYPORT_HOST</key>
		<string>0.0.0.0</string>
		<key>SKYPORT_PORT</key>
		<string>8080</string>
	</dict>
	<key>SoftResourceLimits</key>
	<dict>
		<key>NumberOfFiles</key>
		<integer>65536</integer>
	</dict>
</dict>
</plist>
`, serviceName, binaryPath)
}

func statusValue(running bool) string {
	if running {
		return "active"
	}
	return "inactive"
}

func macOSIsRootUser() bool {
	currentUser, err := user.Current()
	if err != nil {
		return false
	}
	return currentUser.Uid == "0"
}
