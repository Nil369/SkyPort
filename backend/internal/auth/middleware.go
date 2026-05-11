package auth

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

const bearerPrefix = "Bearer "

// TokenFromRequest extracts a bearer token from the Authorization header or token query param.
func TokenFromRequest(c *fiber.Ctx) string {
	if h := strings.TrimSpace(c.Get("Authorization")); h != "" {
		if strings.HasPrefix(h, bearerPrefix) {
			return strings.TrimSpace(strings.TrimPrefix(h, bearerPrefix))
		}
		return strings.TrimSpace(h)
	}
	return strings.TrimSpace(c.Query("token"))
}

// RequireJWT validates a Bearer access token and stores claims in context.
func RequireJWT(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := TokenFromRequest(c)
		if raw == "" {
			return response.Unauthorized(c, "missing or invalid authorization header")
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

func UserIDFromCtx(c *fiber.Ctx) (uint, error) {
	return userIDFromCtx(c)
}
