//go:build darwin

package daemon

// newPlatformServiceManager returns the launchd-based service manager for macOS.
func newPlatformServiceManager() ServiceManager {
	return NewLaunchdManager()
}

// defaultPlatformServiceName returns the default service name for macOS.
func defaultPlatformServiceName() string {
	return "in.skyport.server"
}
