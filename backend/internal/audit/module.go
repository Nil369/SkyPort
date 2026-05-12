package audit

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/models"
	"skyport/internal/response"
)

// Module exposes read-only audit trails for administrators.
type Module struct{}

func (m *Module) Name() string { return "audit" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/audit", auth.RequireJWT(a.Config.JWTSecret), access.RequirePermissions(a, access.PermUsersManage))

	r.Get("/activity", func(c *fiber.Ctx) error {
		var rows []models.UserActivityLog
		q := a.DB.Order("id desc").Limit(200)
		if err := q.Find(&rows).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"items": rows})
	})

	r.Get("/logins", func(c *fiber.Ctx) error {
		var rows []models.LoginHistory
		if err := a.DB.Order("id desc").Limit(200).Find(&rows).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"items": rows})
	})

	return nil
}
