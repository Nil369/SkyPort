package users

import (
	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/auth"
)

// Module exposes RBAC-aware user administration APIs.
type Module struct{}

func (m *Module) Name() string { return "users" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/users", auth.RequireJWT(a.Config.JWTSecret))

	r.Get("/me", meProfileGet(a))
	r.Patch("/me", meProfilePatch(a))
	r.Get("/me/avatar", meAvatarGet(a))
	r.Post("/me/avatar", meAvatarUpload(a))
	r.Post("/me/password", mePasswordChange(a))

	r.Get("/", access.RequirePermissions(a, access.PermUsersManage), listUsers(a))
	r.Post("/invite", access.RequirePermissions(a, access.PermUsersManage), inviteUser(a))
	r.Post("/:id/reset-password", access.RequirePermissions(a, access.PermUsersManage), adminResetUserPassword(a))
	r.Patch("/:id", access.RequirePermissions(a, access.PermUsersManage), patchUser(a))
	r.Delete("/:id", access.RequirePermissions(a, access.PermUsersManage), deleteUser(a))

	return nil
}
