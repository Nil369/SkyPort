// Package version holds build-time and release metadata consumed by health checks,
// logs, and future upgrade endpoints. Override Version via -ldflags at release time.
package version

// Version is the application semver shown in /api/v1/health and logs.
var Version = "0.0.1"

// Commit is the abbreviated git SHA injected via -ldflags at release time.
var Commit = "dev"

// BuildTime is the UTC ISO8601 build timestamp injected via -ldflags.
var BuildTime = ""

// Service is the logical service name for operators and dashboards.
const Service = "skyport"
