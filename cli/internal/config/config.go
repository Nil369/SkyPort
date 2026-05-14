package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// SkyPortConfig represents the main ~/.skyport/config.yaml
type SkyPortConfig struct {
	// Auth & Servers
	Servers map[string]*ServerConfig `yaml:"servers,omitempty"`
	Active  string                   `yaml:"active_server,omitempty"`

	// Preferences
	Theme       string `yaml:"theme,omitempty"`       // dark, light
	OutputMode  string `yaml:"output_mode,omitempty"` // table, json
	AutoUpdate  bool   `yaml:"auto_update,omitempty"`
	CheckUpdate bool   `yaml:"check_update,omitempty"`

	// WebSocket
	ReconnectMaxAttempts int `yaml:"reconnect_max_attempts,omitempty"`
	ReconnectDelay       int `yaml:"reconnect_delay_seconds,omitempty"`

	// Default ports
	DefaultWebUIPort int `yaml:"default_webui_port,omitempty"`

	CreatedAt time.Time `yaml:"created_at,omitempty"`
	UpdatedAt time.Time `yaml:"updated_at,omitempty"`
}

// ServerConfig represents a registered server
type ServerConfig struct {
	ID          string    `yaml:"id"`
	Name        string    `yaml:"name"`
	BaseURL     string    `yaml:"base_url"`
	Description string    `yaml:"description,omitempty"`
	SSHHost     string    `yaml:"ssh_host,omitempty"`
	SSHUser     string    `yaml:"ssh_user,omitempty"`
	SSHPort     int       `yaml:"ssh_port,omitempty"`
	CreatedAt   time.Time `yaml:"created_at"`
	UpdatedAt   time.Time `yaml:"updated_at"`
}

// Manager manages the ~/.skyport directory and config files
type Manager struct {
	mu       sync.RWMutex
	basePath string
	config   *SkyPortConfig
	dataDir  string
	workDir  string
	logsDir  string
	cacheDir string
	tmpDir   string
}

// New creates a new config manager and initializes directories
func New() (*Manager, error) {
	basePath, err := SkyPortDir()
	if err != nil {
		return nil, err
	}

	m := &Manager{
		basePath: basePath,
		dataDir:  filepath.Join(basePath, "data"),
		workDir:  filepath.Join(basePath, "workspace"),
		logsDir:  filepath.Join(basePath, "logs"),
		cacheDir: filepath.Join(basePath, "cache"),
		tmpDir:   filepath.Join(basePath, "tmp"),
	}

	// Create all directories
	for _, dir := range []string{m.dataDir, m.workDir, m.logsDir, m.cacheDir, m.tmpDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, fmt.Errorf("failed to create %s: %w", dir, err)
		}
	}

	// Load or create config
	if err := m.load(); err != nil {
		return nil, err
	}

	return m, nil
}

// SkyPortDir returns the ~/.skyport directory path
func SkyPortDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".skyport"), nil
}

// ConfigPath returns the path to config.yaml
func ConfigPath() (string, error) {
	base, err := SkyPortDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "config.yaml"), nil
}

// load reads the config file or creates a new one
func (m *Manager) load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	configPath := filepath.Join(m.basePath, "config.yaml")

	// Try to read existing config
	if data, err := os.ReadFile(configPath); err == nil {
		cfg := &SkyPortConfig{}
		if err := yaml.Unmarshal(data, cfg); err == nil {
			m.config = cfg
			return nil
		}
	}

	// Create new default config
	m.config = &SkyPortConfig{
		Servers:              make(map[string]*ServerConfig),
		Theme:                "dark",
		OutputMode:           "table",
		AutoUpdate:           true,
		CheckUpdate:          true,
		ReconnectMaxAttempts: 10,
		ReconnectDelay:       3,
		DefaultWebUIPort:     8080,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	return m.Save()
}

// Save writes the config to file
func (m *Manager) Save() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.config.UpdatedAt = time.Now()

	data, err := yaml.Marshal(m.config)
	if err != nil {
		return err
	}

	configPath := filepath.Join(m.basePath, "config.yaml")
	return os.WriteFile(configPath, data, 0o600)
}

// Get returns a copy of the current config
func (m *Manager) Get() *SkyPortConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Deep copy
	cfg := &SkyPortConfig{
		Servers:              make(map[string]*ServerConfig),
		Active:               m.config.Active,
		Theme:                m.config.Theme,
		OutputMode:           m.config.OutputMode,
		AutoUpdate:           m.config.AutoUpdate,
		CheckUpdate:          m.config.CheckUpdate,
		ReconnectMaxAttempts: m.config.ReconnectMaxAttempts,
		ReconnectDelay:       m.config.ReconnectDelay,
		DefaultWebUIPort:     m.config.DefaultWebUIPort,
		CreatedAt:            m.config.CreatedAt,
		UpdatedAt:            m.config.UpdatedAt,
	}

	for id, srv := range m.config.Servers {
		cfg.Servers[id] = &ServerConfig{
			ID:          srv.ID,
			Name:        srv.Name,
			BaseURL:     srv.BaseURL,
			Description: srv.Description,
			SSHHost:     srv.SSHHost,
			SSHUser:     srv.SSHUser,
			SSHPort:     srv.SSHPort,
			CreatedAt:   srv.CreatedAt,
			UpdatedAt:   srv.UpdatedAt,
		}
	}

	return cfg
}

// Set updates config with custom values
func (m *Manager) Set(key string, value interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	switch key {
	case "theme":
		m.config.Theme = value.(string)
	case "output_mode":
		m.config.OutputMode = value.(string)
	case "auto_update":
		m.config.AutoUpdate = value.(bool)
	case "check_update":
		m.config.CheckUpdate = value.(bool)
	default:
		return fmt.Errorf("unknown config key: %s", key)
	}

	m.config.UpdatedAt = time.Now()
	return m.Save()
}

// AddServer adds or updates a server config
func (m *Manager) AddServer(srv *ServerConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if srv.ID == "" {
		return fmt.Errorf("server ID is required")
	}
	if srv.Name == "" {
		return fmt.Errorf("server name is required")
	}
	if srv.BaseURL == "" {
		return fmt.Errorf("server base URL is required")
	}

	srv.UpdatedAt = time.Now()
	m.config.Servers[srv.ID] = srv

	// Set as active if no active server
	if m.config.Active == "" {
		m.config.Active = srv.ID
	}

	return m.Save()
}

// RemoveServer removes a server config
func (m *Manager) RemoveServer(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.config.Servers, id)

	// Reset active if we removed it
	if m.config.Active == id {
		m.config.Active = ""
		for id := range m.config.Servers {
			m.config.Active = id
			break
		}
	}

	return m.Save()
}

// GetServer returns a server config
func (m *Manager) GetServer(id string) *ServerConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.config.Servers[id]
}

// GetActiveServer returns the active server config
func (m *Manager) GetActiveServer() *ServerConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.config.Active == "" {
		return nil
	}
	return m.config.Servers[m.config.Active]
}

// SetActiveServer sets the active server
func (m *Manager) SetActiveServer(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.config.Servers[id]; !ok {
		return fmt.Errorf("server %q not found", id)
	}

	m.config.Active = id
	return m.Save()
}

// ListServers returns all servers
func (m *Manager) ListServers() []*ServerConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	servers := make([]*ServerConfig, 0, len(m.config.Servers))
	for _, srv := range m.config.Servers {
		servers = append(servers, srv)
	}
	return servers
}

// Directories
func (m *Manager) DataDir() string  { return m.dataDir }
func (m *Manager) WorkDir() string  { return m.workDir }
func (m *Manager) LogsDir() string  { return m.logsDir }
func (m *Manager) CacheDir() string { return m.cacheDir }
func (m *Manager) TmpDir() string   { return m.tmpDir }
func (m *Manager) BasePath() string { return m.basePath }

// SaveJSON saves arbitrary JSON to the data directory
func (m *Manager) SaveJSON(filename string, data interface{}) error {
	path := filepath.Join(m.dataDir, filename)
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, bytes, 0o600)
}

// LoadJSON loads arbitrary JSON from the data directory
func (m *Manager) LoadJSON(filename string, data interface{}) error {
	path := filepath.Join(m.dataDir, filename)
	bytes, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(bytes, data)
}

// Clear removes all temporary files
func (m *Manager) ClearTmp() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	return os.RemoveAll(m.tmpDir)
}

// ClearCache removes all cache files
func (m *Manager) ClearCache() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	return os.RemoveAll(m.cacheDir)
}
