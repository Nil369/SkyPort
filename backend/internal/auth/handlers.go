package auth

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"skyport/internal/response"
	"skyport/internal/validator"
)

// registerHandler handles user registration.
// @Summary Register user
// @Tags Auth
// @Description Register a new user account
// @Accept json
// @Produce json
// @Param request body RegisterRequest true "Registration payload"
// @Success 201 {object} AuthResponse
// @Failure 400 {object} response.ErrorBody
// @Failure 409 {object} response.ErrorBody
// @Router /api/v1/auth/register [post]
func registerHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req RegisterRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		out, err := svc.Register(req)
		if err != nil {
			return response.Error(c, fiber.StatusConflict, "email_already_exists", "email is already registered")
		}
		return response.JSON(c, fiber.StatusCreated, out)
	}
}

// loginHandler handles user login and issues JWT tokens.
// @Summary Login
// @Tags Auth
// @Description Authenticate user and return JWT access token
// @Accept json
// @Produce json
// @Param request body LoginRequest true "Login payload"
// @Success 200 {object} AuthResponse
// @Failure 400 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
// @Router /api/v1/auth/login [post]
func loginHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req LoginRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		out, err := svc.Login(req)
		if err != nil {
			if errors.Is(err, ErrInvalidCredentials) {
				return response.Unauthorized(c, "invalid email or password")
			}
			return err
		}
		// Placeholder: optional secure HTTP-only cookie mode can be added here.
		// c.Cookie(&fiber.Cookie{Name: "sp_access", Value: out.AccessToken, HTTPOnly: true, Secure: true})
		return response.OK(c, out)
	}
}

// logoutHandler is a placeholder for logout actions.
// @Summary Logout
// @Tags Auth
// @Description Logout (placeholder)
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/auth/logout [post]
func logoutHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Placeholder for refresh-token invalidation and cookie clearing.
		return response.OK(c, fiber.Map{"success": true, "message": "logout placeholder"})
	}
}

// meHandler returns the currently authenticated user.
// @Summary Current user
// @Tags Auth
// @Description Returns details about the authenticated user
// @Produce json
// @Success 200 {object} UserDTO
// @Failure 401 {object} response.ErrorBody
// @Security BearerAuth
// @Router /api/v1/auth/me [get]
func meHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		out, err := svc.Me(userID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return response.Unauthorized(c, "user not found")
			}
			return err
		}
		return response.OK(c, out)
	}
}
