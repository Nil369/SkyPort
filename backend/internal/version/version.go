// Package version holds build-time and release metadata consumed by health checks,
// logs, and future upgrade endpoints. Override Version via -ldflags at release time.
package version

// Version is the application semver shown in /api/v1/health and logs.
var Version = "0.0.1"

// Service is the logical service name for operators and dashboards.
const Service = "skyport"
