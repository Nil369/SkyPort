package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/zalando/go-keyring"
	"gopkg.in/yaml.v3"
)

const keyringService = "skyport"

type ServerProfile struct {
	ID          string    `yaml:"id"`
	Name        string    `yaml:"name"`
	BaseURL     string    `yaml:"base_url"`
	Description string    `yaml:"description,omitempty"`
	Default     bool      `yaml:"default,omitempty"`
	CreatedAt   time.Time `yaml:"created_at"`
}

type Config struct {
	ActiveServer string                   `yaml:"active_server,omitempty"`
	Servers      map[string]ServerProfile `yaml:"servers,omitempty"`
}

type Store struct {
	mu         sync.Mutex
	configPath string
	configDir  string
	config     *Config
}

func DefaultConfigDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "skyport"), nil
}

func DefaultConfigPath() (string, error) {
	dir, err := DefaultConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.yaml"), nil
}

func New(configPath string) (*Store, error) {
	if strings.TrimSpace(configPath) == "" {
		var err error
		configPath, err = DefaultConfigPath()
		if err != nil {
			return nil, err
		}
	}
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{configPath: configPath, configDir: configDir}
	cfg, err := s.read()
	if err != nil {
		return nil, err
	}
	s.config = cfg
	return s, nil
}

func (s *Store) Config() *Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneConfig(s.config)
}

func (s *Store) Save(cfg *Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cfg == nil {
		cfg = &Config{Servers: map[string]ServerProfile{}}
	}
	if cfg.Servers == nil {
		cfg.Servers = map[string]ServerProfile{}
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.configPath, data, 0o600); err != nil {
		return err
	}
	s.config = cloneConfig(cfg)
	return nil
}

func (s *Store) Reload() (*Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, err := s.read()
	if err != nil {
		return nil, err
	}
	s.config = cfg
	return cloneConfig(cfg), nil
}

func (s *Store) ListServers() []ServerProfile {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]ServerProfile, 0, len(s.config.Servers))
	for _, profile := range s.config.Servers {
		out = append(out, profile)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Default != out[j].Default {
			return out[i].Default
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

func (s *Store) AddServer(profile ServerProfile) (ServerProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.config.Servers == nil {
		s.config.Servers = map[string]ServerProfile{}
	}
	if strings.TrimSpace(profile.ID) == "" {
		profile.ID = newID()
	}
	if strings.TrimSpace(profile.Name) == "" {
		return ServerProfile{}, errors.New("server name is required")
	}
	if strings.TrimSpace(profile.BaseURL) == "" {
		return ServerProfile{}, errors.New("server url is required")
	}
	profile.BaseURL = normalizeBaseURL(profile.BaseURL)
	profile.CreatedAt = time.Now().UTC()
	if profile.Default || s.config.ActiveServer == "" {
		s.config.ActiveServer = profile.ID
		profile.Default = true
	}
	for key, existing := range s.config.Servers {
		existing.Default = existing.ID == profile.ID
		s.config.Servers[key] = existing
	}
	s.config.Servers[profile.ID] = profile
	if err := s.saveLocked(); err != nil {
		return ServerProfile{}, err
	}
	return profile, nil
}

func (s *Store) RemoveServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.config.Servers, id)
	if s.config.ActiveServer == id {
		s.config.ActiveServer = ""
		for _, profile := range s.config.Servers {
			s.config.ActiveServer = profile.ID
			break
		}
	}
	if err := s.deleteTokenLocked(id); err != nil {
		return err
	}
	return s.saveLocked()
}

func (s *Store) SetActiveServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.config.Servers[id]; !ok {
		return fmt.Errorf("server %q not found", id)
	}
	s.config.ActiveServer = id
	for key, profile := range s.config.Servers {
		profile.Default = key == id
		s.config.Servers[key] = profile
	}
	return s.saveLocked()
}

func (s *Store) ActiveServer() (ServerProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.config.ActiveServer != "" {
		if profile, ok := s.config.Servers[s.config.ActiveServer]; ok {
			return profile, true
		}
	}
	for _, profile := range s.config.Servers {
		return profile, true
	}
	return ServerProfile{}, false
}

func (s *Store) ResolveServer(ref string) (ServerProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.TrimSpace(ref) == "" {
		return ServerProfile{}, false
	}
	if profile, ok := s.config.Servers[ref]; ok {
		return profile, true
	}
	for _, profile := range s.config.Servers {
		if strings.EqualFold(profile.Name, ref) {
			return profile, true
		}
	}
	return ServerProfile{}, false
}

func (s *Store) Token(serverID string) (string, error) {
	if strings.TrimSpace(serverID) == "" {
		return "", errors.New("server id is required")
	}
	return keyring.Get(keyringService, serverID)
}

func (s *Store) SaveToken(serverID, token string) error {
	if strings.TrimSpace(serverID) == "" {
		return errors.New("server id is required")
	}
	if strings.TrimSpace(token) == "" {
		return errors.New("token is required")
	}
	return keyring.Set(keyringService, serverID, token)
}

func (s *Store) DeleteToken(serverID string) error {
	if strings.TrimSpace(serverID) == "" {
		return errors.New("server id is required")
	}
	return keyring.Delete(keyringService, serverID)
}

func (s *Store) saveLocked() error {
	if s.config == nil {
		s.config = &Config{Servers: map[string]ServerProfile{}}
	}
	if s.config.Servers == nil {
		s.config.Servers = map[string]ServerProfile{}
	}
	data, err := yaml.Marshal(s.config)
	if err != nil {
		return err
	}
	return os.WriteFile(s.configPath, data, 0o600)
}

func (s *Store) deleteTokenLocked(id string) error {
	if err := keyring.Delete(keyringService, id); err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return err
	}
	return nil
}

func (s *Store) read() (*Config, error) {
	cfg := &Config{Servers: map[string]ServerProfile{}}
	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return cfg, nil
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	if cfg.Servers == nil {
		cfg.Servers = map[string]ServerProfile{}
	}
	return cfg, nil
}

func cloneConfig(cfg *Config) *Config {
	if cfg == nil {
		return &Config{Servers: map[string]ServerProfile{}}
	}
	out := &Config{ActiveServer: cfg.ActiveServer, Servers: map[string]ServerProfile{}}
	for id, profile := range cfg.Servers {
		out.Servers[id] = profile
	}
	return out
}

func normalizeBaseURL(raw string) string {
	url := strings.TrimSpace(raw)
	url = strings.TrimRight(url, "/")
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		return url
	}
	return "https://" + url
}

func newID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("srv_%d", time.Now().UnixNano())
	}
	return "srv_" + hex.EncodeToString(buf)
}
