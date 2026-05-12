package pm2

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/response"
)

// Module wires native PM2 REST + WebSocket into the app.
type Module struct {
	svc *Service
	hub *StateHub
}

func NewModule() *Module {
	svc := NewService()
	return &Module{
		svc: svc,
		hub: NewStateHub(svc),
	}
}

func (m *Module) Name() string { return "pm2" }

func (m *Module) Register(a *app.App) error {
	g := a.Fiber.Group("/api/v1/pm2")
	g.Use(auth.RequireJWT(a.Config.JWTSecret))
	g.Use(access.RequirePermissions(a, access.PermPm2Manage))

	g.Get("/status", statusHandler())
	g.Get("/processes", m.listHandler())
	g.Get("/processes/:name/logs", m.logsHandler())
	g.Post("/processes/:name/start", m.actionHandler("start"))
	g.Post("/processes/:name/stop", m.actionHandler("stop"))
	g.Post("/processes/:name/restart", m.actionHandler("restart"))
	g.Delete("/processes/:name", m.actionHandler("delete"))

	registerWebSocket(a, m.hub)
	log.Print("pm2: native host integration — GET /api/v1/pm2/processes | WebSocket /ws/pm2")
	return nil
}

func statusHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		bin, err := ResolveBinary()
		if err != nil {
			return response.OK(c, fiber.Map{
				"installed": false,
				"binary":    "",
				"native":    true,
			})
		}
		return response.OK(c, fiber.Map{
			"installed": true,
			"binary":    bin,
			"native":    true,
		})
	}
}

func (m *Module) listHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if _, err := ResolveBinary(); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "pm2_missing", "pm2 binary not found in PATH")
		}
		list, err := m.svc.ListProcesses(c.UserContext())
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "pm2_list_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"processes": list})
	}
}

func (m *Module) actionHandler(action string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		if name == "" {
			return response.BadRequest(c, "missing process name")
		}
		if _, err := ResolveBinary(); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "pm2_missing", "pm2 binary not found in PATH")
		}
		ctx, cancel := context.WithTimeout(c.UserContext(), 15*time.Second)
		defer cancel()
		out, err := m.svc.RunAction(ctx, action, name)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "pm2_action_failed", out)
		}
		m.hub.BroadcastRefresh(ctx, "action:"+action)
		return response.OK(c, fiber.Map{"status": "ok", "action": action, "process": name, "output": out})
	}
}

func (m *Module) logsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Params("name")
		if name == "" {
			return response.BadRequest(c, "missing process name")
		}
		if _, err := ResolveBinary(); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "pm2_missing", "pm2 binary not found in PATH")
		}
		lines := c.QueryInt("lines", 150)
		ctx, cancel := context.WithTimeout(c.UserContext(), 15*time.Second)
		defer cancel()
		text, err := m.svc.Logs(ctx, name, lines)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "pm2_logs_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"name": name, "lines": lines, "log": text})
	}
}
