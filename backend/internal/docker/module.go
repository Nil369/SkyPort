package docker

import (
	"context"
	"os/exec"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
)

type Module struct{}

func (m *Module) Name() string { return "docker" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableDocker {
		return nil
	}
	a.Fiber.Get("/api/v1/docker/status", func(c *fiber.Ctx) error {
		_, lookErr := exec.LookPath("docker")
		installed := lookErr == nil
		daemon := false
		if installed {
			ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "docker", "info")
			daemon = cmd.Run() == nil
		}
		return response.OK(c, fiber.Map{
			"installed":           installed,
			"daemon_running":      daemon,
			"orchestration_ready": false,
			"message":             "docker module placeholder ready",
		})
	})
	return nil
}
