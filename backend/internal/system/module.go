package system

import (
	"runtime"

	"github.com/gofiber/fiber/v2"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"

	"skyport/internal/app"
	"skyport/internal/response"
)

type Module struct{}

func (m *Module) Name() string { return "system" }

func (m *Module) Register(a *app.App) error {
	a.Fiber.Get("/api/v1/system/info", func(c *fiber.Ctx) error {
		h, _ := host.Info()
		vm, _ := mem.VirtualMemory()
		return response.OK(c, fiber.Map{
			"hostname":     h.Hostname,
			"architecture": runtime.GOARCH,
			"os":           runtime.GOOS,
			"uptime":       h.Uptime,
			"go_version":   runtime.Version(),
			"cpu_cores":    runtime.NumCPU(),
			"memory": fiber.Map{
				"total_bytes": vm.Total,
				"used_bytes":  vm.Used,
				"free_bytes":  vm.Free,
			},
		})
	})
	return nil
}
