//go:build linux

package daemon

// newPlatformServiceManager returns the systemd-based service manager for Linux.
func newPlatformServiceManager() ServiceManager {
	return NewSystemdManager()
}

// defaultPlatformServiceName returns the default service name for Linux.
func defaultPlatformServiceName() string {
	return "skyport"
}
