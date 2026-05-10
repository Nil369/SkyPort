package auth

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"skyport/internal/response"
	"skyport/internal/validator"
)

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

func logoutHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Placeholder for refresh-token invalidation and cookie clearing.
		return response.OK(c, fiber.Map{"success": true, "message": "logout placeholder"})
	}
}

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
