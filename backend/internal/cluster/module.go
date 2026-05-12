package cluster

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/models"
	"skyport/internal/response"
)

// Module exposes cluster inventory placeholders for future agent wiring.
type Module struct{}

type createServerRequest struct {
	Name        string `json:"name"`
	Address     string `json:"address"`
	Fingerprint string `json:"fingerprint"`
}

func (m *Module) Name() string { return "cluster" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/cluster", auth.RequireJWT(a.Config.JWTSecret), access.RequirePermissions(a, access.PermServersManage))

	r.Post("/servers", func(c *fiber.Ctx) error {
		var req createServerRequest
		if err := c.BodyParser(&req); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid server payload")
		}
		name := strings.TrimSpace(req.Name)
		if name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "server name is required")
		}
		server := models.ClusterServer{
			Name:        name,
			Address:     strings.TrimSpace(req.Address),
			Fingerprint: strings.TrimSpace(req.Fingerprint),
			Status:      "unknown",
		}
		if err := a.DB.Create(&server).Error; err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{"server": server})
	})

	r.Get("/servers", func(c *fiber.Ctx) error {
		var servers []models.ClusterServer
		if err := a.DB.Order("id asc").Find(&servers).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"servers": servers})
	})

	r.Get("/agents", func(c *fiber.Ctx) error {
		var agents []models.AgentRecord
		if err := a.DB.Order("id asc").Find(&agents).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"agents": agents})
	})

	return nil
}
