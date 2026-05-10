// Package metrics (service) implements host metric collection via gopsutil.
//
// Architecture: Service is the single place that talks to the OS. Handlers stay thin
// and depend on Service.Collect / Snapshot only. Swap Service with a mock in tests.
package metrics

import (
	"context"
	"fmt"
	"math"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

// cpuSampleWait is how long gopsutil samples CPU counters (shorter = snappier, noisier).
// Kept small to stay responsive on 512MB VPS without blocking WS tick for seconds.
const cpuSampleWait = 200 * time.Millisecond

// Service collects HostSnapshot values. One instance per process is enough (stateless).
type Service struct {
	diskPath string
}

// NewService returns a collector using diskPath for Usage(); if empty, OS root is chosen.
func NewService(diskPath string) *Service {
	if diskPath == "" {
		diskPath = defaultDiskPath()
	}
	return &Service{diskPath: diskPath}
}

// Snapshot implements app.MetricsProvider — returns *HostSnapshot as any for JSON encoding.
func (s *Service) Snapshot(ctx context.Context) (any, error) {
	return s.Collect(ctx)
}

// Collect gathers all fields for HostSnapshot. ctx cancels in-flight OS calls where supported.
func (s *Service) Collect(ctx context.Context) (*HostSnapshot, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	vm, err := mem.VirtualMemory()
	if err != nil {
		return nil, fmt.Errorf("mem.VirtualMemory: %w", err)
	}

	du, err := disk.Usage(s.diskPath)
	if err != nil {
		return nil, fmt.Errorf("disk.Usage(%q): %w", s.diskPath, err)
	}

	hinfo, err := host.Info()
	if err != nil {
		return nil, fmt.Errorf("host.Info: %w", err)
	}

	uptime, err := host.Uptime()
	if err != nil {
		return nil, fmt.Errorf("host.Uptime: %w", err)
	}

	// Percent blocks briefly to measure delta; honor cancellation after sample.
	type cpuResult struct {
		p []float64
		e error
	}
	ch := make(chan cpuResult, 1)
	go func() {
		p, e := cpu.Percent(cpuSampleWait, false)
		ch <- cpuResult{p, e}
	}()
	var pct []float64
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case r := <-ch:
		if r.e != nil {
			return nil, fmt.Errorf("cpu.Percent: %w", r.e)
		}
		pct = r.p
	}

	cores, err := cpu.Counts(true)
	if err != nil {
		return nil, fmt.Errorf("cpu.Counts: %w", err)
	}

	usage := 0.0
	if len(pct) > 0 {
		usage = pct[0]
	}

	return &HostSnapshot{
		Schema:      SchemaHostV1,
		CollectedAt: time.Now().UTC(),
		Host: HostInfo{
			Hostname:      hinfo.Hostname,
			UptimeSeconds: uptime,
			UptimeHuman:   humanUptime(uptime),
		},
		CPU: CPUStats{
			UsagePercent: usage,
			CoresLogical: cores,
		},
		Memory: MemStats{
			TotalBytes:  vm.Total,
			TotalHuman:  humanBytes(vm.Total),
			UsedBytes:   vm.Used,
			UsedHuman:   humanBytes(vm.Used),
			FreeBytes:   vm.Free,
			FreeHuman:   humanBytes(vm.Free),
			UsedPercent: vm.UsedPercent,
		},
		Disk: DiskStats{
			Path:        s.diskPath,
			TotalBytes:  du.Total,
			TotalHuman:  humanBytes(du.Total),
			UsedBytes:   du.Used,
			UsedHuman:   humanBytes(du.Used),
			FreeBytes:   du.Free,
			FreeHuman:   humanBytes(du.Free),
			UsedPercent: du.UsedPercent,
		},
	}, nil
}

func humanBytes(v uint64) string {
	if v < 1024 {
		return fmt.Sprintf("%d B", v)
	}
	units := []string{"KB", "MB", "GB", "TB", "PB"}
	value := float64(v)
	idx := -1
	for value >= 1024 && idx < len(units)-1 {
		value /= 1024
		idx++
	}
	value = math.Round(value*100) / 100
	return fmt.Sprintf("%.2f %s", value, units[idx])
}

func humanUptime(seconds uint64) string {
	d := time.Duration(seconds) * time.Second
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	out := ""
	if h > 0 {
		out += fmt.Sprintf("%dhr ", h)
	}
	if m > 0 || h > 0 {
		out += fmt.Sprintf("%dmin ", m)
	}
	out += fmt.Sprintf("%ds", s)
	return strings.TrimSpace(out)
}

func defaultDiskPath() string {
	if runtime.GOOS == "windows" {
		d := os.Getenv("SystemDrive")
		if d == "" {
			d = "C:"
		}
		return d + `\`
	}
	return "/"
}
