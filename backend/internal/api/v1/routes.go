// Package v1 registers versioned HTTP routes under /api/v1.
//
// Architecture: Each subdomain (health, projects, terminal, …) can move into its own
// package with a Mount(*app.App, fiber.Router) function as the API grows.
package v1

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/response"
	"skyport/internal/version"
)

// Mount attaches /api/v1 routes. Pass the root App for handler DI.
func Mount(a *app.App) {
	r := a.Fiber.Group("/api/v1")

	r.Get("/health", health(a))
	auth.Mount(a, r)

	protected := r.Group("/protected", auth.RequireJWT(a.Config.JWTSecret))
	protected.Get("/example", protectedExample(a))
}

func health(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		_ = a // reserved for future DB ping / dependency checks
		return response.OK(c, fiber.Map{
			"status":  "ok",
			"service": version.Service,
			"version": version.Version,
		})
	}
}

func protectedExample(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		_ = a
		return response.OK(c, fiber.Map{
			"message": "this route is behind JWT middleware (placeholder)",
		})
	}
}
