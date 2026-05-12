package auth

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"skyport/internal/app"
	"skyport/internal/models"
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
func setupHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var n int64
		if err := a.DB.Model(&models.User{}).Count(&n).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"needs_setup": n == 0})
	}
}

func registerHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req RegisterRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		out, err := svc.Register(req)
		if err != nil {
			if errors.Is(err, ErrRegistrationClosed) {
				return response.Error(c, fiber.StatusForbidden, "registration_closed", "public registration is disabled")
			}
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
		out, err := svc.Login(req, c.IP(), c.Get("User-Agent"))
		if err != nil {
			if errors.Is(err, ErrInvalidCredentials) {
				return response.Unauthorized(c, "invalid email or password")
			}
			if errors.Is(err, ErrAccountDisabled) {
				return response.Error(c, fiber.StatusForbidden, "account_disabled", "account is disabled")
			}
			return err
		}
		// Placeholder: optional secure HTTP-only cookie mode can be added here.
		// c.Cookie(&fiber.Cookie{Name: "sp_access", Value: out.AccessToken, HTTPOnly: true, Secure: true})
		return response.OK(c, out)
	}
}

// logoutHandler revokes the active token for current user.
// @Summary Logout
// @Tags Auth
// @Description Logout and revoke current token
// @Produce json
// @Success 200 {object} map[string]any
// @Failure 401 {object} response.ErrorBody
// @Security BearerAuth
// @Router /api/v1/auth/logout [post]
func logoutHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		if err := svc.Logout(userID); err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"success": true, "message": "logged out"})
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

// credentialsHandler returns stored git credentials metadata for the user.
// @Summary Git credentials
// @Tags Auth
// @Description Returns stored git credentials metadata
// @Produce json
// @Success 200 {object} CredentialsDTO
// @Failure 401 {object} response.ErrorBody
// @Security BearerAuth
// @Router /api/v1/auth/credentials [get]
func credentialsHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		var user models.User
		if err := svc.db.First(&user, userID).Error; err != nil {
			return err
		}
		return response.OK(c, CredentialsDTO{
			GitAuthType: strings.TrimSpace(user.GitAuthType),
			HasPAT:      strings.TrimSpace(user.GitPAT) != "",
			HasSSHKey:   strings.TrimSpace(user.GitSSHKey) != "",
		})
	}
}

// updateCredentialsHandler stores git credentials for the user.
// @Summary Update git credentials
// @Tags Auth
// @Description Stores git credentials for reuse on private repos
// @Accept json
// @Produce json
// @Param request body UpdateCredentialsRequest true "Credentials payload"
// @Success 200 {object} CredentialsDTO
// @Failure 401 {object} response.ErrorBody
// @Security BearerAuth
// @Router /api/v1/auth/credentials [post]
func updateCredentialsHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		var req UpdateCredentialsRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		updates := map[string]any{}
		if strings.TrimSpace(req.GitAuthType) != "" {
			updates["git_auth_type"] = strings.TrimSpace(req.GitAuthType)
		}
		if req.ClearPAT {
			updates["git_pat"] = ""
		} else if strings.TrimSpace(req.GitPAT) != "" {
			updates["git_pat"] = strings.TrimSpace(req.GitPAT)
		}
		if req.ClearSSHKey {
			updates["git_ssh_key"] = ""
		} else if strings.TrimSpace(req.GitSSHKey) != "" {
			updates["git_ssh_key"] = req.GitSSHKey
		}
		if len(updates) == 0 {
			return response.OK(c, CredentialsDTO{})
		}
		if err := svc.db.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			return err
		}
		var user models.User
		if err := svc.db.First(&user, userID).Error; err != nil {
			return err
		}
		return response.OK(c, CredentialsDTO{
			GitAuthType: strings.TrimSpace(user.GitAuthType),
			HasPAT:      strings.TrimSpace(user.GitPAT) != "",
			HasSSHKey:   strings.TrimSpace(user.GitSSHKey) != "",
		})
	}
}
