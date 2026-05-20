package github

import (
	"context"
	"net/http"
	"strings"
	"time"

	"skyport/internal/config"
)

type Service struct {
	httpClient *http.Client
	apiBaseURL string
	webBaseURL string
	bridgeURL  string
	appID      string
	privateKey string
}

func NewService(cfg *config.Config) *Service {
	apiBase := strings.TrimSpace(cfg.GitHubAPIBaseURL)
	if apiBase == "" {
		apiBase = "https://api.github.com"
	}
	webBase := strings.TrimSpace(cfg.GitHubWebBaseURL)
	if webBase == "" {
		webBase = "https://github.com"
	}
	bridgeURL := strings.TrimSpace(cfg.GitHubBridgeURL)
	if bridgeURL == "" {
		bridgeURL = "https://skyport.akashhalder.in"
	}
	privateKey := strings.TrimSpace(cfg.GitHubPrivateKey)
	if privateKey == "" {
		privateKey = strings.TrimSpace(cfg.GitHubAppPrivateKey)
	}
	return &Service{
		httpClient: &http.Client{Timeout: 20 * time.Second},
		apiBaseURL: strings.TrimRight(apiBase, "/"),
		webBaseURL: strings.TrimRight(webBase, "/"),
		bridgeURL:  strings.TrimRight(bridgeURL, "/"),
		appID:      strings.TrimSpace(cfg.GitHubAppID),
		privateKey: privateKey,
	}
}

func (s *Service) hasAppCredentials() bool {
	return strings.TrimSpace(s.appID) != "" && strings.TrimSpace(s.privateKey) != ""
}

func (s *Service) bridgeConnectURL(instanceOrigin string) string {
	instanceOrigin = strings.TrimSpace(instanceOrigin)
	if instanceOrigin == "" {
		instanceOrigin = "http://localhost:8080"
	}
	return s.bridgeURL + "/api/github/connect?instance=" + urlQueryEscape(instanceOrigin)
}

func (s *Service) installationAppURL() string {
	return s.webBaseURL + "/apps/" + strings.TrimSpace(s.appID) + "/installations/new"
}

func (s *Service) detectAndSuggest(projectPath string) (FrameworkDetection, error) {
	return DetectFramework(projectPath)
}

func (s *Service) cloneRepository(ctx context.Context, targetPath, repository, branch, token string) error {
	return cloneRepository(ctx, targetPath, repository, branch, token)
}
