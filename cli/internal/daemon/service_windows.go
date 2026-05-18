//go:build windows

package daemon

// newPlatformServiceManager returns the Windows process-based service manager.
func newPlatformServiceManager() ServiceManager {
	return NewWindowsProcessManager()
}

// defaultPlatformServiceName returns the default service name for Windows.
func defaultPlatformServiceName() string {
	return "SkyPortServer"
}
