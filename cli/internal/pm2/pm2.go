package pm2

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ProcessStatus represents PM2 process status
type ProcessStatus string

const (
	StatusOnline      ProcessStatus = "online"
	StatusStopped     ProcessStatus = "stopped"
	StatusStopping    ProcessStatus = "stopping"
	StatusExited      ProcessStatus = "exited"
	StatusOne2many    ProcessStatus = "one2many"
	StatusErrorFatal  ProcessStatus = "error"
	StatusOneManyDone ProcessStatus = "one-many-done"
	StatusUnstable    ProcessStatus = "unstable"
	StatusWaiting     ProcessStatus = "waiting"
)

// Process represents a PM2 managed process
type Process struct {
	ID       int     `json:"pm_id"`
	PID      int     `json:"pid"`
	Name     string  `json:"name"`
	Script   string  `json:"script"`
	Args     string  `json:"args"`
	Cwd      string  `json:"cwd"`
	ExecMode string  `json:"exec_mode"`
	Status   string  `json:"status"`
	Restarts int     `json:"restart_time"`
	Uptime   int64   `json:"pm_uptime"`
	CPU      float64 `json:"monit.cpu"`
	Memory   int64   `json:"monit.memory"`
	User     string  `json:"user"`
	Version  string  `json:"version,omitempty"`
	NodeVer  string  `json:"node_version,omitempty"`
	Port     int     `json:"listen_addr,omitempty"`
}

// Stats represents runtime statistics
type Stats struct {
	CPU      float64 `json:"cpu"`
	Memory   int64   `json:"memory"`
	Uptime   int64   `json:"uptime"`
	Restarts int     `json:"restarts"`
}

// Logs represents process logs
type Logs struct {
	ProcessID int      `json:"process_id"`
	Name      string   `json:"name"`
	Lines     []string `json:"lines"`
}

// Client is a PM2 API client
type Client interface {
	ListProcesses(ctx context.Context) ([]Process, error)
	GetProcess(ctx context.Context, nameOrID string) (*Process, error)
	StartProcess(ctx context.Context, name, script string, opts map[string]interface{}) error
	StopProcess(ctx context.Context, nameOrID string) error
	RestartProcess(ctx context.Context, nameOrID string) error
	DeleteProcess(ctx context.Context, nameOrID string) error
	GetLogs(ctx context.Context, nameOrID string, lines int) (*Logs, error)
	GetStats(ctx context.Context, nameOrID string) (*Stats, error)
}

// HTTPClient implements Client using HTTP
type HTTPClient struct {
	apiClient interface {
		Req(ctx context.Context, method, path string, body any, out any) error
	}
}

// NewHTTPClient creates a new HTTP-based PM2 client
func NewHTTPClient(apiClient interface {
	Req(ctx context.Context, method, path string, body any, out any) error
}) *HTTPClient {
	return &HTTPClient{apiClient: apiClient}
}

// ListProcesses returns all PM2 processes
func (c *HTTPClient) ListProcesses(ctx context.Context) ([]Process, error) {
	var processes []Process
	err := c.apiClient.Req(ctx, "GET", "/api/v1/pm2/list", nil, &processes)
	if err != nil {
		return nil, fmt.Errorf("failed to list PM2 processes: %w", err)
	}
	return processes, nil
}

// GetProcess returns a specific process
func (c *HTTPClient) GetProcess(ctx context.Context, nameOrID string) (*Process, error) {
	var process Process
	path := fmt.Sprintf("/api/v1/pm2/process/%s", nameOrID)
	err := c.apiClient.Req(ctx, "GET", path, nil, &process)
	if err != nil {
		return nil, fmt.Errorf("failed to get PM2 process: %w", err)
	}
	return &process, nil
}

// StartProcess starts a new PM2 process
func (c *HTTPClient) StartProcess(ctx context.Context, name, script string, opts map[string]interface{}) error {
	payload := map[string]interface{}{
		"name":   name,
		"script": script,
	}
	for k, v := range opts {
		payload[k] = v
	}

	var result map[string]interface{}
	err := c.apiClient.Req(ctx, "POST", "/api/v1/pm2/start", payload, &result)
	if err != nil {
		return fmt.Errorf("failed to start PM2 process: %w", err)
	}
	return nil
}

// StopProcess stops a PM2 process
func (c *HTTPClient) StopProcess(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/pm2/process/%s/stop", nameOrID)
	err := c.apiClient.Req(ctx, "POST", path, nil, &result)
	if err != nil {
		return fmt.Errorf("failed to stop PM2 process: %w", err)
	}
	return nil
}

// RestartProcess restarts a PM2 process
func (c *HTTPClient) RestartProcess(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/pm2/process/%s/restart", nameOrID)
	err := c.apiClient.Req(ctx, "POST", path, nil, &result)
	if err != nil {
		return fmt.Errorf("failed to restart PM2 process: %w", err)
	}
	return nil
}

// DeleteProcess deletes a PM2 process
func (c *HTTPClient) DeleteProcess(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/pm2/process/%s/delete", nameOrID)
	err := c.apiClient.Req(ctx, "POST", path, nil, &result)
	if err != nil {
		return fmt.Errorf("failed to delete PM2 process: %w", err)
	}
	return nil
}

// GetLogs returns process logs
func (c *HTTPClient) GetLogs(ctx context.Context, nameOrID string, lines int) (*Logs, error) {
	var logs Logs
	path := fmt.Sprintf("/api/v1/pm2/process/%s/logs?lines=%d", nameOrID, lines)
	err := c.apiClient.Req(ctx, "GET", path, nil, &logs)
	if err != nil {
		return nil, fmt.Errorf("failed to get PM2 logs: %w", err)
	}
	return &logs, nil
}

// GetStats returns process statistics
func (c *HTTPClient) GetStats(ctx context.Context, nameOrID string) (*Stats, error) {
	var stats Stats
	path := fmt.Sprintf("/api/v1/pm2/process/%s/stats", nameOrID)
	err := c.apiClient.Req(ctx, "GET", path, nil, &stats)
	if err != nil {
		return nil, fmt.Errorf("failed to get PM2 stats: %w", err)
	}
	return &stats, nil
}

// ProcessFormatter formats process info for display
type ProcessFormatter struct {
	process *Process
}

// NewProcessFormatter creates a formatter
func NewProcessFormatter(p *Process) *ProcessFormatter {
	return &ProcessFormatter{process: p}
}

// FormatStatus returns a colored status
func (pf *ProcessFormatter) FormatStatus() string {
	switch pf.process.Status {
	case "online":
		return "🟢 online"
	case "stopped":
		return "🔴 stopped"
	case "stopping":
		return "🟡 stopping"
	case "error":
		return "❌ error"
	default:
		return "⚪ " + pf.process.Status
	}
}

// FormatCPU returns CPU usage formatted
func (pf *ProcessFormatter) FormatCPU() string {
	return fmt.Sprintf("%.1f%%", pf.process.CPU)
}

// FormatMemory returns memory usage formatted
func (pf *ProcessFormatter) FormatMemory() string {
	mb := float64(pf.process.Memory) / (1024 * 1024)
	return fmt.Sprintf("%.1f MB", mb)
}

// FormatUptime returns uptime formatted
func (pf *ProcessFormatter) FormatUptime() string {
	duration := time.Duration(pf.process.Uptime) * time.Millisecond
	return duration.String()
}

// FormatRow returns a table row for display
func (pf *ProcessFormatter) FormatRow() []string {
	return []string{
		pf.process.Name,
		pf.process.ExecMode,
		pf.process.Script,
		fmt.Sprintf("%d", pf.process.PID),
		pf.FormatCPU(),
		pf.FormatMemory(),
		pf.FormatStatus(),
		fmt.Sprintf("%d", pf.process.Restarts),
		pf.FormatUptime(),
	}
}

// ProcessToJSON converts a process to JSON
func ProcessToJSON(p *Process) (string, error) {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}
