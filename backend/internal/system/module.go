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
	a.Fiber.Get("/api/v1/system/info", systemInfoHandler())
	return nil
}

// systemInfoHandler returns host and runtime information.
// @Summary System info
// @Tags System
// @Description Returns host and runtime information (OS, memory, cpu, uptime)
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/v1/system/info [get]
func systemInfoHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
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
	}
}
