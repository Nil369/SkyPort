// Package api is the HTTP composition root: global middleware + version mounts.
package api

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/api/v1"
	"skyport/internal/app"
	"skyport/internal/middleware"
	"skyport/internal/response"
	"skyport/internal/version"
)

// Mount installs framework middleware and API versions. Call once during bootstrap.
func Mount(a *app.App) {
	// Order: recovery outermost so panics from inner middleware are caught.
	a.Fiber.Use(middleware.Recovery())
	a.Fiber.Use(middleware.RequestID())
	a.Fiber.Use(middleware.RequestLogger())
	a.Fiber.Use(middleware.SecurityHeaders())
	a.Fiber.Use(middleware.CORS(a.Config.AllowedOrigins))
	a.Fiber.Use(middleware.RateLimitPlaceholder())

	a.Fiber.Get("/", func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{
			"service": "SkyPort",
			"status":  "running",
			"version": version.Version,
			"message": "Welcome to SkyPort API",
		})
	})

	v1.Mount(a)
}
