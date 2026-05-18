// Package daemon provides platform-agnostic service lifecycle management.
// Each platform (Windows, Linux systemd, macOS launchd) implements ServiceManager.
package daemon

import (
	"context"
)

// ServiceManager defines the interface for platform-specific service operations.
// Implementations exist for Windows (process-based), Linux (systemd), and macOS (launchd).
type ServiceManager interface {
	// Install creates and enables a service for the given binary.
	// Returns error if service already exists or if not enough permissions.
	Install(ctx context.Context, binaryPath, serviceName string) error

	// Uninstall disables and removes the service.
	Uninstall(ctx context.Context, serviceName string) error

	// Start launches the service.
	Start(ctx context.Context, serviceName string) error

	// Stop halts the service gracefully.
	Stop(ctx context.Context, serviceName string) error

	// Restart stops and starts the service.
	Restart(ctx context.Context, serviceName string) error

	// Status returns the current running state of the service.
	// Returns error if service doesn't exist or query fails.
	Status(ctx context.Context, serviceName string) (ServiceStatus, error)

	// Enable marks the service to auto-start on boot.
	Enable(ctx context.Context, serviceName string) error

	// Disable prevents auto-start on boot.
	Disable(ctx context.Context, serviceName string) error
}

// ServiceStatus represents the current state of a managed service.
type ServiceStatus struct {
	// Running indicates if the service is currently active.
	Running bool

	// PID is the process ID if running, 0 otherwise.
	PID int

	// Enabled indicates if the service is configured for auto-start.
	Enabled bool

	// Status is a human-readable status message (e.g., "active", "inactive", "failed").
	Status string

	// Error contains any error details from the service.
	Error string
}

// NewServiceManager returns a platform-appropriate ServiceManager for the current OS.
// The actual implementation is delegated to platform-specific files (service_windows.go, service_linux.go, service_darwin.go).
func NewServiceManager() (ServiceManager, error) {
	return newPlatformServiceManager(), nil
}

// DefaultServiceName returns the platform-appropriate service name for SkyPort.
// The actual implementation is delegated to platform-specific files.
func DefaultServiceName() string {
	return defaultPlatformServiceName()
}
