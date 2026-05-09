package middleware

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

// Recovery catches panics in the handler chain and returns a JSON 500.
// Fiber's built-in recover middleware defaults to plain text; this stays consistent
// with response.APIError for clients and proxies.
func Recovery() fiber.Handler {
	return func(c *fiber.Ctx) (err error) {
		defer func() {
			if r := recover(); r != nil {
				// Panics are logged by Fiber's logger when chained after RequestLogger;
				// add a structured logger here when you introduce one.
				err = response.Internal(c, "internal server error")
			}
		}()
		return c.Next()
	}
}
