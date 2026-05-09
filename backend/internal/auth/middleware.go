// Package auth will host JWT issuance, validation, and RBAC.
//
// Architecture: Middleware is the only HTTP-facing surface; services hold business
// rules. When JWT lands, inject a TokenVerifier interface from bootstrap so tests can
// stub verification without touching Fiber.
package auth

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

const bearerPrefix = "Bearer "

// RequirePlaceholder reserves the /api/v1/protected/* route group shape.
// Replace with RequireJWT(verifier) without changing router wiring.
func RequirePlaceholder() fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" || !strings.HasPrefix(h, bearerPrefix) {
			return response.Unauthorized(c, "missing or invalid authorization header")
		}
		raw := strings.TrimPrefix(h, bearerPrefix)
		if raw == "" {
			return response.Unauthorized(c, "empty bearer token")
		}
		// Future: verify JWT, load user, e.g. c.Locals("user", user).
		_ = raw
		return response.Unauthorized(c, "jwt authentication not yet implemented")
	}
}
