package capabilities

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"

	"skyport/internal/app"
	"skyport/internal/response"
)

type Module struct{}

func (m *Module) Name() string { return "capabilities" }

func (m *Module) Register(a *app.App) error {
	a.Fiber.Get("/api/v1/system/capabilities", capabilitiesHandler())
	return nil
}

type Snapshot struct {
	TotalRAMBytes       uint64 `json:"total_ram_bytes"`
	FreeRAMBytes        uint64 `json:"free_ram_bytes"`
	SwapTotalBytes      uint64 `json:"swap_total_bytes"`
	CPUCores            int    `json:"cpu_cores"`
	Architecture        string `json:"architecture"`
	Virtualization      string `json:"virtualization"`
	DockerAvailable     bool   `json:"docker_available"`      // docker CLI installed
	DockerDaemonRunning bool   `json:"docker_daemon_running"` // docker engine reachable
	Recommendation      string `json:"recommendation"`
	RecommendationNotes string `json:"recommendation_notes"`
}

func Detect(ctx context.Context) Snapshot {
	vm, _ := mem.VirtualMemory()
	sw, _ := mem.SwapMemory()
	h, _ := host.InfoWithContext(ctx)

	dockerAvailable, dockerDaemonRunning := dockerStatus(ctx)
	totalGB := float64(vm.Total) / (1024 * 1024 * 1024)
	reco := "native"
	notes := "native chosen for low memory profile"
	if dockerAvailable && totalGB >= 2.0 {
		reco = "docker"
		if dockerDaemonRunning {
			notes = "docker recommended: RAM >= 2GB and daemon reachable"
		} else {
			notes = "docker CLI found and RAM >= 2GB; start Docker daemon to use container deployments"
		}
	} else if totalGB >= 1.0 {
		reco = "pm2"
		notes = "pm2 recommended: moderate RAM profile"
	}

	return Snapshot{
		TotalRAMBytes:       vm.Total,
		FreeRAMBytes:        vm.Available,
		SwapTotalBytes:      sw.Total,
		CPUCores:            runtime.NumCPU(),
		Architecture:        runtime.GOARCH,
		Virtualization:      strings.TrimSpace(h.VirtualizationSystem),
		DockerAvailable:     dockerAvailable,
		DockerDaemonRunning: dockerDaemonRunning,
		Recommendation:      reco,
		RecommendationNotes: notes,
	}
}

// @Summary System capabilities
// @Tags System
// @Produce json
// @Success 200 {object} Snapshot
// @Router /api/v1/system/capabilities [get]
func capabilitiesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, Detect(c.UserContext()))
	}
}

func dockerStatus(ctx context.Context) (bool, bool) {
	path, err := exec.LookPath("docker")
	if err != nil {
		return false, false
	}
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, path, "info")
	return true, cmd.Run() == nil
}
