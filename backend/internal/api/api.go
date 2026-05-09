// Package api is the HTTP composition root: global middleware + version mounts.
package api

import (
	"skyport/internal/api/v1"
	"skyport/internal/app"
	"skyport/internal/middleware"
)

// Mount installs framework middleware and API versions. Call once during bootstrap.
func Mount(a *app.App) {
	// Order: recovery outermost so panics from inner middleware are caught.
	a.Fiber.Use(middleware.Recovery())
	a.Fiber.Use(middleware.RequestLogger())

	v1.Mount(a)
}
