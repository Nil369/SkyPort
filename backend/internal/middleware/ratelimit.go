package middleware

import "github.com/gofiber/fiber/v2"

// RateLimitPlaceholder exists so a real limiter can be slotted in without route churn.
func RateLimitPlaceholder() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return c.Next()
	}
}
