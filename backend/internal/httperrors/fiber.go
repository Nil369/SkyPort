// Package httperrors maps Fiber routing/handler errors to the public JSON shape.
package httperrors

import (
	"errors"
	"log"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

// FiberErrorHandler is wired into fiber.Config.ErrorHandler for consistent JSON.
func FiberErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
	}

	msg := err.Error()
	if code == fiber.StatusInternalServerError && fe == nil {
		msg = "internal server error"
		log.Printf("request_id=%v internal_error=%v path=%s", c.Locals("request_id"), err, c.Path())
	}

	return response.Error(c, code, statusToCode(code), msg)
}

func statusToCode(status int) string {
	switch status {
	case fiber.StatusBadRequest:
		return "bad_request"
	case fiber.StatusUnauthorized:
		return "unauthorized"
	case fiber.StatusForbidden:
		return "forbidden"
	case fiber.StatusNotFound:
		return "not_found"
	case fiber.StatusConflict:
		return "conflict"
	case fiber.StatusTooManyRequests:
		return "rate_limited"
	default:
		return "error"
	}
}
