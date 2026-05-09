// Package response centralizes JSON shapes so API handlers stay thin and consistent.
// Future modules (terminal, deploy, etc.) should use these helpers instead of ad-hoc maps.
package response

import (
	"github.com/gofiber/fiber/v2"
)

// APIError is the standard error body for versioned APIs.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// ErrorBody wraps APIError for a stable top-level key.
type ErrorBody struct {
	Error APIError `json:"error"`
}

// JSON writes JSON with the given HTTP status.
func JSON(c *fiber.Ctx, status int, body any) error {
	return c.Status(status).JSON(body)
}

// OK sends 200 with an arbitrary payload (use for simple GETs).
func OK(c *fiber.Ctx, body any) error {
	return JSON(c, fiber.StatusOK, body)
}

// Error sends a structured error. Prefer stable machine-readable Codes for clients.
func Error(c *fiber.Ctx, status int, code, message string) error {
	return JSON(c, status, ErrorBody{
		Error: APIError{Code: code, Message: message},
	})
}

// ErrorWithDetails extends Error with optional structured details (validation errors, etc.).
func ErrorWithDetails(c *fiber.Ctx, status int, code, message string, details any) error {
	return JSON(c, status, ErrorBody{
		Error: APIError{Code: code, Message: message, Details: details},
	})
}

// Unauthorized is a shorthand for 401 JSON errors.
func Unauthorized(c *fiber.Ctx, message string) error {
	return Error(c, fiber.StatusUnauthorized, "unauthorized", message)
}

// BadRequest is a shorthand for 400 JSON errors.
func BadRequest(c *fiber.Ctx, message string) error {
	return Error(c, fiber.StatusBadRequest, "bad_request", message)
}

// Internal is a shorthand for 500 JSON errors (message should be safe for clients).
func Internal(c *fiber.Ctx, message string) error {
	return Error(c, fiber.StatusInternalServerError, "internal_error", message)
}
