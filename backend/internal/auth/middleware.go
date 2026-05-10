package auth

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

const bearerPrefix = "Bearer "

// RequireJWT validates a Bearer access token and stores claims in context.
func RequireJWT(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" || !strings.HasPrefix(h, bearerPrefix) {
			return response.Unauthorized(c, "missing or invalid authorization header")
		}
		raw := strings.TrimPrefix(h, bearerPrefix)
		if raw == "" {
			return response.Unauthorized(c, "empty bearer token")
		}
		claims, err := ParseAccessToken(raw, secret)
		if err != nil {
			return response.Unauthorized(c, "invalid or expired token")
		}
		c.Locals("auth_user_id", claims.UserID)
		c.Locals("auth_user_email", claims.Email)
		return c.Next()
	}
}

func userIDFromCtx(c *fiber.Ctx) (uint, error) {
	v := c.Locals("auth_user_id")
	id, ok := v.(uint)
	if !ok || id == 0 {
		return 0, fmt.Errorf("unauthenticated")
	}
	return id, nil
}
