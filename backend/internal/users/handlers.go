package users

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/audit"
	"skyport/internal/auth"
	"skyport/internal/models"
	"skyport/internal/response"
	"skyport/internal/validator"
)

type userSummary struct {
	ID       uint     `json:"id"`
	Name     string   `json:"name"`
	Email    string   `json:"email"`
	Enabled  bool     `json:"enabled"`
	Roles    []string `json:"roles"`
	Online   bool     `json:"online"` // placeholder until presence service exists
	JoinedAt string   `json:"joined_at,omitempty"`
}

type inviteRequest struct {
	Email string `json:"email" validate:"required,email"`
	Role  string `json:"role" validate:"required,oneof=owner admin developer viewer"`
}

type inviteResponse struct {
	User                       userSummary `json:"user"`
	TemporaryPassword          string      `json:"temporary_password"`
	TemporaryPasswordShownOnce bool        `json:"temporary_password_shown_once"`
}

type patchUserRequest struct {
	Enabled *bool   `json:"enabled"`
	Role    *string `json:"role" validate:"omitempty,oneof=owner admin developer viewer"`
}

type profilePatchRequest struct {
	Name string `json:"name" validate:"omitempty,min=2,max=120"`
}

type mePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required,min=8,max=128"`
	NewPassword     string `json:"new_password" validate:"required,min=8,max=128"`
}

type adminPasswordResetRequest struct {
	NewPassword string `json:"new_password" validate:"omitempty,min=8,max=128"`
}

func listUsers(a *app.App) fiber.Handler {
	rbac := access.NewService(a.DB)
	return func(c *fiber.Ctx) error {
		var rows []models.User
		if err := a.DB.Order("id asc").Find(&rows).Error; err != nil {
			return err
		}
		out := make([]userSummary, 0, len(rows))
		for _, u := range rows {
			roles, _ := rbac.RoleNamesForUser(u.ID)
			out = append(out, userSummary{
				ID:       u.ID,
				Name:     u.Name,
				Email:    u.Email,
				Enabled:  u.Enabled,
				Roles:    roles,
				Online:   false,
				JoinedAt: u.CreatedAt.UTC().Format("2006-01-02"),
			})
		}
		return response.OK(c, fiber.Map{"users": out})
	}
}

func inviteUser(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req inviteRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		actorID, _ := auth.UserIDFromCtx(c)
		email := strings.ToLower(strings.TrimSpace(req.Email))

		var exists int64
		a.DB.Model(&models.User{}).Where("email = ?", email).Count(&exists)
		if exists > 0 {
			return response.Error(c, fiber.StatusConflict, "email_exists", "user already exists")
		}

		tempPass, err := randomSecret(14)
		if err != nil {
			return err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		user := &models.User{
			Email:        email,
			Name:         strings.Split(email, "@")[0],
			PasswordHash: string(hash),
			Enabled:      true,
		}
		if err := a.DB.Create(user).Error; err != nil {
			return err
		}

		rbac := access.NewService(a.DB)
		if err := rbac.AssignPrimaryRole(user.ID, req.Role); err != nil {
			return err
		}

		roles, _ := rbac.RoleNamesForUser(user.ID)
		audit.Log(a.DB, &actorID, user.ID, "user.invite", email, "role="+req.Role, c.IP())

		return response.JSON(c, fiber.StatusCreated, inviteResponse{
			User: userSummary{
				ID:      user.ID,
				Name:    user.Name,
				Email:   user.Email,
				Enabled: user.Enabled,
				Roles:   roles,
			},
			TemporaryPassword:          tempPass,
			TemporaryPasswordShownOnce: true,
		})
	}
}

func patchUser(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id64, err := strconv.ParseUint(idStr, 10, 32)
		if err != nil || id64 == 0 {
			return response.Error(c, fiber.StatusBadRequest, "invalid_id", "invalid user id")
		}
		var req patchUserRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		actorID, _ := auth.UserIDFromCtx(c)

		var user models.User
		if err := a.DB.First(&user, uint(id64)).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return response.Error(c, fiber.StatusNotFound, "not_found", "user not found")
			}
			return err
		}

		if req.Enabled != nil {
			if err := a.DB.Model(&user).Update("enabled", *req.Enabled).Error; err != nil {
				return err
			}
			audit.Log(a.DB, &actorID, user.ID, "user.enabled", user.Email, strconv.FormatBool(*req.Enabled), c.IP())
		}
		if req.Role != nil {
			rbac := access.NewService(a.DB)
			if err := rbac.AssignPrimaryRole(user.ID, *req.Role); err != nil {
				return err
			}
			audit.Log(a.DB, &actorID, user.ID, "user.role", user.Email, *req.Role, c.IP())
		}

		rbac := access.NewService(a.DB)
		roles, _ := rbac.RoleNamesForUser(user.ID)
		if err := a.DB.First(&user, user.ID).Error; err != nil {
			return err
		}
		return response.OK(c, userSummary{
			ID:      user.ID,
			Name:    user.Name,
			Email:   user.Email,
			Enabled: user.Enabled,
			Roles:   roles,
		})
	}
}

func deleteUser(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id64, err := strconv.ParseUint(idStr, 10, 32)
		if err != nil || id64 == 0 {
			return response.Error(c, fiber.StatusBadRequest, "invalid_id", "invalid user id")
		}
		actorID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		if actorID == uint(id64) {
			return response.Error(c, fiber.StatusBadRequest, "cannot_delete_self", "cannot delete your own account")
		}

		if err := a.DB.Delete(&models.User{}, uint(id64)).Error; err != nil {
			return err
		}
		audit.Log(a.DB, &actorID, uint(id64), "user.delete", idStr, "", c.IP())
		return response.OK(c, fiber.Map{"deleted": true})
	}
}

func meProfileGet(a *app.App) fiber.Handler {
	svc := auth.NewService(a.DB, a.Config)
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		out, err := svc.Me(userID)
		if err != nil {
			return err
		}
		return response.OK(c, out)
	}
}

func meProfilePatch(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		var req profilePatchRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		if strings.TrimSpace(req.Name) == "" {
			return response.Error(c, fiber.StatusBadRequest, "validation_failed", "name required")
		}
		if err := a.DB.Model(&models.User{}).Where("id = ?", userID).Update("name", strings.TrimSpace(req.Name)).Error; err != nil {
			return err
		}
		svc := auth.NewService(a.DB, a.Config)
		out, err := svc.Me(userID)
		if err != nil {
			return err
		}
		return response.OK(c, out)
	}
}

func meAvatarGet(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		var user models.User
		if err := a.DB.First(&user, userID).Error; err != nil {
			return err
		}
		rel := strings.TrimSpace(user.AvatarRelativePath)
		if rel == "" {
			return c.SendStatus(fiber.StatusNotFound)
		}
		path := filepath.Join(a.Config.WorkspaceRoot, filepath.FromSlash(rel))
		return c.SendFile(path)
	}
}

func mePasswordChange(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		var req mePasswordRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		var user models.User
		if err := a.DB.First(&user, userID).Error; err != nil {
			return err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
			return response.Error(c, fiber.StatusUnauthorized, "invalid_password", "current password is incorrect")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if err := a.DB.Model(&user).Updates(map[string]any{
			"password_hash":          string(hash),
			"active_token":           "",
			"token_expires_at":       nil,
			"password_reset_token":   "",
			"password_reset_expires": nil,
		}).Error; err != nil {
			return err
		}
		actorID := userID
		audit.Log(a.DB, &actorID, userID, "user.password_change", user.Email, "self-service", c.IP())
		return response.OK(c, fiber.Map{"success": true})
	}
}

func adminResetUserPassword(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id64, err := strconv.ParseUint(idStr, 10, 32)
		if err != nil || id64 == 0 {
			return response.Error(c, fiber.StatusBadRequest, "invalid_id", "invalid user id")
		}
		actorID, _ := auth.UserIDFromCtx(c)
		var req adminPasswordResetRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		var user models.User
		if err := a.DB.First(&user, uint(id64)).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return response.Error(c, fiber.StatusNotFound, "not_found", "user not found")
			}
			return err
		}

		newPass := strings.TrimSpace(req.NewPassword)
		if newPass == "" {
			var genErr error
			newPass, genErr = randomSecret(16)
			if genErr != nil {
				return genErr
			}
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if err := a.DB.Model(&user).Updates(map[string]any{
			"password_hash":          string(hash),
			"active_token":           "",
			"token_expires_at":       nil,
			"password_reset_token":   "",
			"password_reset_expires": nil,
		}).Error; err != nil {
			return err
		}
		audit.Log(a.DB, &actorID, user.ID, "user.password_reset", user.Email, "admin reset", c.IP())
		return response.OK(c, fiber.Map{"temporary_password": newPass, "shown_once": true})
	}
}

func meAvatarUpload(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}

		fh, err := c.FormFile("file")
		if err != nil {
			return response.Error(c, fiber.StatusBadRequest, "missing_file", "expected multipart field file")
		}
		src, err := fh.Open()
		if err != nil {
			return err
		}
		defer src.Close()

		ext := strings.ToLower(filepath.Ext(fh.Filename))
		switch ext {
		case ".png", ".jpg", ".jpeg", ".webp", ".gif":
		default:
			return response.Error(c, fiber.StatusBadRequest, "invalid_type", "allowed: png, jpg, webp, gif")
		}

		baseDir := filepath.Join(a.Config.WorkspaceRoot, "users", strconv.FormatUint(uint64(userID), 10))
		if err := os.MkdirAll(baseDir, 0o755); err != nil {
			return err
		}
		rel := filepath.ToSlash(filepath.Join("users", strconv.FormatUint(uint64(userID), 10), "avatar"+ext))
		dstPath := filepath.Join(a.Config.WorkspaceRoot, filepath.FromSlash(rel))

		dst, err := os.Create(dstPath)
		if err != nil {
			return err
		}
		defer dst.Close()

		if _, err := io.Copy(dst, io.LimitReader(src, 4*1024*1024)); err != nil {
			return err
		}

		if err := a.DB.Model(&models.User{}).Where("id = ?", userID).Update("avatar_relative_path", rel).Error; err != nil {
			return err
		}

		return response.OK(c, fiber.Map{"avatar_relative_path": rel})
	}
}

func randomSecret(n int) (string, error) {
	if n <= 0 {
		return "", errors.New("invalid length")
	}
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	s := hex.EncodeToString(b)
	if len(s) > n {
		return s[:n], nil
	}
	return s, nil
}
