// Package branding documents executable and release metadata used by build scripts.
// Windows .exe icons are applied via rsrc-generated resource.syso (see Makefile / scripts).
// Linux .desktop and macOS .icns are produced under packaging/ during release prep.
package branding

const (
	// AppName is the human-readable product name.
	AppName = "SkyPort"
	// LinuxDesktopID is the XDG application id base (e.g. io.skyport.SkyPort).
	LinuxDesktopID = "io.skyport.SkyPort"
	// DefaultWindowsIconPath is the conventional repo path for the .ico used with rsrc.
	DefaultWindowsIconPath = "assets/logo.ico"
)
