//go:build windows

package daemon

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
)

// WindowsProcessManager implements ServiceManager for Windows using direct process management.
// This maintains the current behavior while fitting the new service abstraction.
type WindowsProcessManager struct {
	manager *Manager
}

// NewWindowsProcessManager creates a Windows process-based service manager.
func NewWindowsProcessManager() ServiceManager {
	m, _ := New()
	return &WindowsProcessManager{manager: m}
}

// Install creates the service (Windows: just validates setup, actual registration via SC is optional).
func (w *WindowsProcessManager) Install(ctx context.Context, binaryPath, serviceName string) error {
	// On Windows, we don't require explicit service installation for CLI daemon.
	// The binary is registered as a detached process via manager.Start().
	// If users want Windows Service Manager integration, they can use SC.exe separately.
	return fmt.Errorf("Windows service registration requires Administrator. Use: sc create %s binPath= %q", serviceName, binaryPath)
}

// Uninstall removes the service (Windows: cleanup PID file).
func (w *WindowsProcessManager) Uninstall(ctx context.Context, serviceName string) error {
	// Windows: just stop the process and clean up
	return w.manager.Stop(ctx)
}

// Start launches the daemon process via manager.Start().
func (w *WindowsProcessManager) Start(ctx context.Context, serviceName string) error {
	_, err := w.manager.Start(ctx)
	return err
}

// Stop halts the process via manager.Stop().
func (w *WindowsProcessManager) Stop(ctx context.Context, serviceName string) error {
	return w.manager.Stop(ctx)
}

// Restart restarts the process.
func (w *WindowsProcessManager) Restart(ctx context.Context, serviceName string) error {
	return w.manager.Restart(ctx)
}

// Status returns the current process status.
func (w *WindowsProcessManager) Status(ctx context.Context, serviceName string) (ServiceStatus, error) {
	status, err := w.manager.Status(ctx)
	if err != nil {
		return ServiceStatus{}, err
	}

	return ServiceStatus{
		Running: status.Running,
		PID:     status.PID,
		Enabled: false, // Windows manual process doesn't support "enabled"
		Status:  statusString(status.Running),
		Error:   "",
	}, nil
}

// Enable is a no-op for Windows (Windows processes are started manually).
func (w *WindowsProcessManager) Enable(ctx context.Context, serviceName string) error {
	return fmt.Errorf("Windows process manager does not support auto-start. Use Windows Task Scheduler or SC.exe")
}

// Disable is a no-op for Windows.
func (w *WindowsProcessManager) Disable(ctx context.Context, serviceName string) error {
	return nil
}

func statusString(running bool) string {
	if running {
		return "running"
	}
	return "stopped"
}

// InstallViaServiceManager attempts to install as a Windows Service using SC.exe (admin only).
// This is optional and requires elevation.
func InstallViaServiceManager(serviceName, binaryPath, displayName string) error {
	if !isAdmin() {
		return fmt.Errorf("service installation requires Administrator privileges")
	}

	// Create service: sc create <name> binPath= "<path>" DisplayName= "<display>"
	cmd := exec.Command(
		"sc", "create",
		serviceName,
		fmt.Sprintf("binPath= %q", binaryPath),
		fmt.Sprintf("DisplayName= %q", displayName),
		"start= auto",
	)

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("sc create failed: %w\n%s", err, string(output))
	}

	return nil
}

// UninstallViaServiceManager removes a Windows Service (admin only).
func UninstallViaServiceManager(serviceName string) error {
	if !isAdmin() {
		return fmt.Errorf("service uninstallation requires Administrator privileges")
	}

	cmd := exec.Command("sc", "delete", serviceName)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("sc delete failed: %w\n%s", err, string(output))
	}

	return nil
}

func isAdmin() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	_, err := exec.Command("net", "session").Output()
	return err == nil
}
