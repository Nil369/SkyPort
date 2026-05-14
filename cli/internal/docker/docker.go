package docker

import (
	"context"
	"fmt"
	"time"
)

// Container represents a Docker container
type Container struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Image    string  `json:"image"`
	Status   string  `json:"status"`
	State    string  `json:"state"`
	Ports    string  `json:"ports"`
	Networks string  `json:"networks"`
	Uptime   int64   `json:"uptime"`
	CPU      float64 `json:"cpu"`
	Memory   int64   `json:"memory"`
}

// Image represents a Docker image
type Image struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Tag     string    `json:"tag"`
	Size    int64     `json:"size"`
	Created time.Time `json:"created"`
	Count   int       `json:"count"`
}

// Volume represents a Docker volume
type Volume struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	Size       int64             `json:"size"`
	Created    time.Time         `json:"created"`
	Labels     map[string]string `json:"labels,omitempty"`
}

// Network represents a Docker network
type Network struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Driver     string    `json:"driver"`
	Created    time.Time `json:"created"`
	Scope      string    `json:"scope"`
	Containers int       `json:"containers"`
}

// Stats represents container statistics
type Stats struct {
	ContainerID string  `json:"container_id"`
	CPU         float64 `json:"cpu"`
	Memory      int64   `json:"memory"`
	MemoryMax   int64   `json:"memory_max"`
	NetIn       int64   `json:"net_in"`
	NetOut      int64   `json:"net_out"`
}

// Logs represents container logs
type Logs struct {
	ContainerID string   `json:"container_id"`
	Name        string   `json:"name"`
	Lines       []string `json:"lines"`
	Stdout      string   `json:"stdout"`
	Stderr      string   `json:"stderr"`
}

// Client is a Docker API client
type Client interface {
	ListContainers(ctx context.Context) ([]Container, error)
	GetContainer(ctx context.Context, nameOrID string) (*Container, error)
	StartContainer(ctx context.Context, nameOrID string) error
	StopContainer(ctx context.Context, nameOrID string) error
	RestartContainer(ctx context.Context, nameOrID string) error
	RemoveContainer(ctx context.Context, nameOrID string, force bool) error
	GetLogs(ctx context.Context, nameOrID string, lines int) (*Logs, error)
	GetStats(ctx context.Context, nameOrID string) (*Stats, error)

	ListImages(ctx context.Context) ([]Image, error)
	PullImage(ctx context.Context, imageRef string) error
	RemoveImage(ctx context.Context, imageRef string) error

	ListVolumes(ctx context.Context) ([]Volume, error)
	CreateVolume(ctx context.Context, name string) (*Volume, error)
	RemoveVolume(ctx context.Context, name string) error

	ListNetworks(ctx context.Context) ([]Network, error)
	CreateNetwork(ctx context.Context, name string) (*Network, error)
	RemoveNetwork(ctx context.Context, name string) error

	ExecCommand(ctx context.Context, nameOrID string, cmd []string) (string, error)
}

// HTTPClient implements Client using HTTP
type HTTPClient struct {
	apiClient interface {
		Req(ctx context.Context, method, path string, body any, out any) error
	}
}

// NewHTTPClient creates a new HTTP-based Docker client
func NewHTTPClient(apiClient interface {
	Req(ctx context.Context, method, path string, body any, out any) error
}) *HTTPClient {
	return &HTTPClient{apiClient: apiClient}
}

// ListContainers returns all Docker containers
func (c *HTTPClient) ListContainers(ctx context.Context) ([]Container, error) {
	var containers []Container
	err := c.apiClient.Req(ctx, "GET", "/api/v1/docker/containers", nil, &containers)
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}
	return containers, nil
}

// GetContainer returns a specific container
func (c *HTTPClient) GetContainer(ctx context.Context, nameOrID string) (*Container, error) {
	var container Container
	path := fmt.Sprintf("/api/v1/docker/container/%s", nameOrID)
	err := c.apiClient.Req(ctx, "GET", path, nil, &container)
	if err != nil {
		return nil, fmt.Errorf("failed to get container: %w", err)
	}
	return &container, nil
}

// StartContainer starts a container
func (c *HTTPClient) StartContainer(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/container/%s/start", nameOrID)
	return c.apiClient.Req(ctx, "POST", path, nil, &result)
}

// StopContainer stops a container
func (c *HTTPClient) StopContainer(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/container/%s/stop", nameOrID)
	return c.apiClient.Req(ctx, "POST", path, nil, &result)
}

// RestartContainer restarts a container
func (c *HTTPClient) RestartContainer(ctx context.Context, nameOrID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/container/%s/restart", nameOrID)
	return c.apiClient.Req(ctx, "POST", path, nil, &result)
}

// RemoveContainer removes a container
func (c *HTTPClient) RemoveContainer(ctx context.Context, nameOrID string, force bool) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/container/%s?force=%v", nameOrID, force)
	return c.apiClient.Req(ctx, "DELETE", path, nil, &result)
}

// GetLogs returns container logs
func (c *HTTPClient) GetLogs(ctx context.Context, nameOrID string, lines int) (*Logs, error) {
	var logs Logs
	path := fmt.Sprintf("/api/v1/docker/container/%s/logs?lines=%d", nameOrID, lines)
	err := c.apiClient.Req(ctx, "GET", path, nil, &logs)
	if err != nil {
		return nil, fmt.Errorf("failed to get logs: %w", err)
	}
	return &logs, nil
}

// GetStats returns container statistics
func (c *HTTPClient) GetStats(ctx context.Context, nameOrID string) (*Stats, error) {
	var stats Stats
	path := fmt.Sprintf("/api/v1/docker/container/%s/stats", nameOrID)
	err := c.apiClient.Req(ctx, "GET", path, nil, &stats)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}
	return &stats, nil
}

// ListImages returns all images
func (c *HTTPClient) ListImages(ctx context.Context) ([]Image, error) {
	var images []Image
	err := c.apiClient.Req(ctx, "GET", "/api/v1/docker/images", nil, &images)
	if err != nil {
		return nil, fmt.Errorf("failed to list images: %w", err)
	}
	return images, nil
}

// PullImage pulls an image
func (c *HTTPClient) PullImage(ctx context.Context, imageRef string) error {
	payload := map[string]string{"image": imageRef}
	var result map[string]interface{}
	return c.apiClient.Req(ctx, "POST", "/api/v1/docker/images/pull", payload, &result)
}

// RemoveImage removes an image
func (c *HTTPClient) RemoveImage(ctx context.Context, imageRef string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/image/%s", imageRef)
	return c.apiClient.Req(ctx, "DELETE", path, nil, &result)
}

// ListVolumes returns all volumes
func (c *HTTPClient) ListVolumes(ctx context.Context) ([]Volume, error) {
	var volumes []Volume
	err := c.apiClient.Req(ctx, "GET", "/api/v1/docker/volumes", nil, &volumes)
	if err != nil {
		return nil, fmt.Errorf("failed to list volumes: %w", err)
	}
	return volumes, nil
}

// CreateVolume creates a volume
func (c *HTTPClient) CreateVolume(ctx context.Context, name string) (*Volume, error) {
	payload := map[string]string{"name": name}
	var volume Volume
	err := c.apiClient.Req(ctx, "POST", "/api/v1/docker/volumes", payload, &volume)
	if err != nil {
		return nil, fmt.Errorf("failed to create volume: %w", err)
	}
	return &volume, nil
}

// RemoveVolume removes a volume
func (c *HTTPClient) RemoveVolume(ctx context.Context, name string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/volume/%s", name)
	return c.apiClient.Req(ctx, "DELETE", path, nil, &result)
}

// ListNetworks returns all networks
func (c *HTTPClient) ListNetworks(ctx context.Context) ([]Network, error) {
	var networks []Network
	err := c.apiClient.Req(ctx, "GET", "/api/v1/docker/networks", nil, &networks)
	if err != nil {
		return nil, fmt.Errorf("failed to list networks: %w", err)
	}
	return networks, nil
}

// CreateNetwork creates a network
func (c *HTTPClient) CreateNetwork(ctx context.Context, name string) (*Network, error) {
	payload := map[string]string{"name": name}
	var network Network
	err := c.apiClient.Req(ctx, "POST", "/api/v1/docker/networks", payload, &network)
	if err != nil {
		return nil, fmt.Errorf("failed to create network: %w", err)
	}
	return &network, nil
}

// RemoveNetwork removes a network
func (c *HTTPClient) RemoveNetwork(ctx context.Context, name string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/docker/network/%s", name)
	return c.apiClient.Req(ctx, "DELETE", path, nil, &result)
}

// ExecCommand executes a command in a container
func (c *HTTPClient) ExecCommand(ctx context.Context, nameOrID string, cmd []string) (string, error) {
	payload := map[string]interface{}{"cmd": cmd}
	var result map[string]string
	path := fmt.Sprintf("/api/v1/docker/container/%s/exec", nameOrID)
	err := c.apiClient.Req(ctx, "POST", path, payload, &result)
	if err != nil {
		return "", err
	}
	return result["output"], nil
}

// ContainerFormatter formats container info for display
type ContainerFormatter struct {
	container *Container
}

// NewContainerFormatter creates a formatter
func NewContainerFormatter(c *Container) *ContainerFormatter {
	return &ContainerFormatter{container: c}
}

// FormatStatus returns a status symbol and text
func (cf *ContainerFormatter) FormatStatus() string {
	switch cf.container.State {
	case "running":
		return "🟢 running"
	case "exited":
		return "🔴 exited"
	case "paused":
		return "🟡 paused"
	default:
		return "⚪ " + cf.container.State
	}
}

// FormatCPU returns CPU usage formatted
func (cf *ContainerFormatter) FormatCPU() string {
	return fmt.Sprintf("%.1f%%", cf.container.CPU)
}

// FormatMemory returns memory usage formatted
func (cf *ContainerFormatter) FormatMemory() string {
	mb := float64(cf.container.Memory) / (1024 * 1024)
	return fmt.Sprintf("%.1f MB", mb)
}

// FormatRow returns a table row for display
func (cf *ContainerFormatter) FormatRow() []string {
	return []string{
		cf.container.Name,
		cf.container.Image,
		cf.FormatStatus(),
		cf.FormatCPU(),
		cf.FormatMemory(),
		cf.container.Ports,
		cf.container.Networks,
	}
}
