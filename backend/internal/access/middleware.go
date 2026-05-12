package access

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
)

func userIDFromLocals(c *fiber.Ctx) (uint, error) {
	v := c.Locals("auth_user_id")
	id, ok := v.(uint)
	if !ok || id == 0 {
		return 0, fmt.Errorf("unauthenticated")
	}
	return id, nil
}

// RequirePermissions validates JWT then ensures the user holds every permission key (AND).
func RequirePermissions(container *app.App, keys ...string) fiber.Handler {
	svc := NewService(container.DB)
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromLocals(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		ok, err := svc.UserHasAllPermissions(userID, keys...)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "rbac_failed", err.Error())
		}
		if !ok {
			return response.Error(c, fiber.StatusForbidden, "forbidden", "missing permission: "+strings.Join(keys, ","))
		}
		return c.Next()
	}
}

// RequireAnyPermission grants access when any listed permission matches (OR).
func RequireAnyPermission(container *app.App, keys ...string) fiber.Handler {
	svc := NewService(container.DB)
	return func(c *fiber.Ctx) error {
		userID, err := userIDFromLocals(c)
		if err != nil {
			return response.Unauthorized(c, "unauthorized")
		}
		for _, k := range keys {
			ok, err := svc.UserHasPermission(userID, k)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "rbac_failed", err.Error())
			}
			if ok {
				return c.Next()
			}
		}
		return response.Error(c, fiber.StatusForbidden, "forbidden", "missing permission")
	}
}
