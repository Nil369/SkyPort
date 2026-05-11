// Package api is the HTTP composition root: global middleware + version mounts.
package api

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	swagger "github.com/swaggo/fiber-swagger"

	v1 "skyport/internal/api/v1"
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

	a.Fiber.Get("/api", apiRootHandler())

	v1.Mount(a)

	// Swagger UI (after /api and /api/v1 per routing contract)
	a.Fiber.Get("/docs/*", swagger.WrapHandler)
	a.Fiber.Get("/docs", func(c *fiber.Ctx) error { return c.Redirect("/docs/index.html") })
}

// apiRootHandler returns service metadata for operators and load balancers.
// @Summary API root
// @Tags Root
// @Description Service metadata and doc link
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api [get]
func apiRootHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{
			"message":        "Welcome to SkyPort API! 🎉",
			"service":        "SkyPort",
			"status":         "running",
			"version":        version.Version,
			"visit_api_docs": fmt.Sprintf("Visit the API docs at: %s/docs/index.html", c.BaseURL()),
		})
	}
}
