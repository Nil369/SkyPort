package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

// RequestLogger returns Fiber's logger tuned for production: method, path, status, latency.
// For JSON logging to an aggregator, swap the Format/Output fields here in one place.
func RequestLogger() fiber.Handler {
	return logger.New(logger.Config{
		Format:     "${time} | ${status} | ${latency} | req=${locals:request_id} | ${ip} | ${method} ${path}\n",
		TimeFormat: time.RFC3339,
		TimeZone:   "UTC",
	})
}
