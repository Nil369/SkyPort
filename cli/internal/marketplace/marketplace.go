package marketplace

import (
	"context"
	"fmt"
	"runtime"
)

// OS represents the operating system
type OS string

const (
	OSLinux   OS = "linux"
	OSWindows OS = "windows"
	OSDarwin  OS = "darwin"
)

// Architecture represents CPU architecture
type Architecture string

const (
	ArchAmd64 Architecture = "amd64"
	ArchArm64 Architecture = "arm64"
	ArchArm   Architecture = "arm"
)

// InstallMode represents the installation method
type InstallMode string

const (
	ModeDocker      InstallMode = "docker"
	ModePackage     InstallMode = "package"
	ModeCompose     InstallMode = "docker-compose"
	ModeSourceBuild InstallMode = "source"
)

// App represents a marketplace application
type App struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Category    string        `json:"category"`
	Runtime     string        `json:"runtime"`
	Port        int           `json:"port"`
	Memory      int           `json:"memory"` // MB
	Disk        int           `json:"disk"`   // MB
	Modes       []InstallMode `json:"modes"`
	Icon        string        `json:"icon"`
	Tags        []string      `json:"tags"`
	Featured    bool          `json:"featured"`
	Public      bool          `json:"public"`
	CreatedAt   string        `json:"created_at"`
}

// InstallRequest represents an installation request
type InstallRequest struct {
	AppID       string            `json:"app_id"`
	Name        string            `json:"name"`
	Mode        InstallMode       `json:"mode"`
	Port        int               `json:"port,omitempty"`
	Memory      int               `json:"memory,omitempty"`
	Disk        int               `json:"disk,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
}

// InstallResult represents the result of an installation
type InstallResult struct {
	AppID     string `json:"app_id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Port      int    `json:"port"`
	Container string `json:"container,omitempty"`
	Process   string `json:"process,omitempty"`
	Error     string `json:"error,omitempty"`
}

// SearchQuery represents marketplace search parameters
type SearchQuery struct {
	Query    string `json:"query"`
	Category string `json:"category,omitempty"`
	Runtime  string `json:"runtime,omitempty"`
	Limit    int    `json:"limit,omitempty"`
	Offset   int    `json:"offset,omitempty"`
}

// Client is a marketplace API client
type Client interface {
	SearchApps(ctx context.Context, query *SearchQuery) ([]App, error)
	GetApp(ctx context.Context, appID string) (*App, error)
	ListCategories(ctx context.Context) ([]string, error)
	GetFeaturedApps(ctx context.Context) ([]App, error)
	InstallApp(ctx context.Context, req *InstallRequest) (*InstallResult, error)
	UninstallApp(ctx context.Context, appID string) error
	ListInstalled(ctx context.Context) ([]App, error)
}

// HTTPClient implements Client using HTTP
type HTTPClient struct {
	apiClient interface {
		Req(ctx context.Context, method, path string, body any, out any) error
	}
}

// NewHTTPClient creates a new HTTP-based marketplace client
func NewHTTPClient(apiClient interface {
	Req(ctx context.Context, method, path string, body any, out any) error
}) *HTTPClient {
	return &HTTPClient{apiClient: apiClient}
}

// SearchApps searches for marketplace apps
func (c *HTTPClient) SearchApps(ctx context.Context, query *SearchQuery) ([]App, error) {
	var apps []App
	err := c.apiClient.Req(ctx, "POST", "/api/v1/marketplace/search", query, &apps)
	if err != nil {
		return nil, fmt.Errorf("failed to search apps: %w", err)
	}
	return apps, nil
}

// GetApp gets a specific app
func (c *HTTPClient) GetApp(ctx context.Context, appID string) (*App, error) {
	var app App
	path := fmt.Sprintf("/api/v1/marketplace/app/%s", appID)
	err := c.apiClient.Req(ctx, "GET", path, nil, &app)
	if err != nil {
		return nil, fmt.Errorf("failed to get app: %w", err)
	}
	return &app, nil
}

// ListCategories returns all marketplace categories
func (c *HTTPClient) ListCategories(ctx context.Context) ([]string, error) {
	var categories []string
	err := c.apiClient.Req(ctx, "GET", "/api/v1/marketplace/categories", nil, &categories)
	if err != nil {
		return nil, fmt.Errorf("failed to list categories: %w", err)
	}
	return categories, nil
}

// GetFeaturedApps returns featured apps
func (c *HTTPClient) GetFeaturedApps(ctx context.Context) ([]App, error) {
	var apps []App
	err := c.apiClient.Req(ctx, "GET", "/api/v1/marketplace/featured", nil, &apps)
	if err != nil {
		return nil, fmt.Errorf("failed to get featured apps: %w", err)
	}
	return apps, nil
}

// InstallApp installs a marketplace app
func (c *HTTPClient) InstallApp(ctx context.Context, req *InstallRequest) (*InstallResult, error) {
	var result InstallResult
	err := c.apiClient.Req(ctx, "POST", "/api/v1/marketplace/install", req, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to install app: %w", err)
	}
	return &result, nil
}

// UninstallApp uninstalls a marketplace app
func (c *HTTPClient) UninstallApp(ctx context.Context, appID string) error {
	var result map[string]interface{}
	path := fmt.Sprintf("/api/v1/marketplace/app/%s", appID)
	return c.apiClient.Req(ctx, "DELETE", path, nil, &result)
}

// ListInstalled returns installed apps
func (c *HTTPClient) ListInstalled(ctx context.Context) ([]App, error) {
	var apps []App
	err := c.apiClient.Req(ctx, "GET", "/api/v1/marketplace/installed", nil, &apps)
	if err != nil {
		return nil, fmt.Errorf("failed to list installed apps: %w", err)
	}
	return apps, nil
}

// GetOS returns the current operating system
func GetOS() OS {
	switch runtime.GOOS {
	case "darwin":
		return OSDarwin
	case "windows":
		return OSWindows
	default:
		return OSLinux
	}
}

// GetArch returns the current architecture
func GetArch() Architecture {
	switch runtime.GOARCH {
	case "amd64":
		return ArchAmd64
	case "arm64":
		return ArchArm64
	case "arm":
		return ArchArm
	default:
		return ArchAmd64
	}
}

// SupportedInstallModes returns install modes supported by current platform
func SupportedInstallModes() []InstallMode {
	os := GetOS()

	// All platforms support docker and compose
	modes := []InstallMode{ModeDocker, ModeCompose}

	// Add package managers
	switch os {
	case OSLinux:
		modes = append(modes, ModePackage)
	case OSWindows:
		modes = append(modes, ModePackage)
	case OSDarwin:
		modes = append(modes, ModePackage)
	}

	// Source build always available
	modes = append(modes, ModeSourceBuild)

	return modes
}

// AppFormatter formats app info for display
type AppFormatter struct {
	app *App
}

// NewAppFormatter creates a formatter
func NewAppFormatter(a *App) *AppFormatter {
	return &AppFormatter{app: a}
}

// FormatCategory returns formatted category
func (af *AppFormatter) FormatCategory() string {
	if af.app.Featured {
		return "⭐ " + af.app.Category
	}
	return af.app.Category
}

// FormatMemory returns memory formatted
func (af *AppFormatter) FormatMemory() string {
	return fmt.Sprintf("%d MB", af.app.Memory)
}

// FormatPort returns port as string
func (af *AppFormatter) FormatPort() string {
	if af.app.Port == 0 {
		return "dynamic"
	}
	return fmt.Sprintf("%d", af.app.Port)
}

// FormatRow returns a table row for display
func (af *AppFormatter) FormatRow() []string {
	modes := ""
	for _, m := range af.app.Modes {
		if modes != "" {
			modes += ", "
		}
		modes += string(m)
	}

	return []string{
		af.app.Name,
		af.FormatCategory(),
		af.app.Runtime,
		modes,
		af.FormatPort(),
		af.FormatMemory(),
	}
}
