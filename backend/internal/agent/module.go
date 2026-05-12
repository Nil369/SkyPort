package agent

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
)

// Module reserves HTTP endpoints for future SkyPort agent token exchange (control-plane facing).
type Module struct{}

func (m *Module) Name() string { return "agent" }

func (m *Module) Register(a *app.App) error {
	a.Fiber.Get("/api/v1/agent/health", func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{"status": "reserved", "message": "agent API not enabled"})
	})
	return nil
}
