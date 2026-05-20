package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"skyport/internal/models"
)

func saveInstallation(c context.Context, db *gorm.DB, installationID int64) (models.GitHubInstallation, error) {
	if installationID <= 0 {
		return models.GitHubInstallation{}, errors.New("installation id must be greater than zero")
	}
	row := models.GitHubInstallation{InstallationID: installationID}
	if err := db.WithContext(c).Where("installation_id = ?", installationID).FirstOrCreate(&row).Error; err != nil {
		return models.GitHubInstallation{}, err
	}
	return row, nil
}

func latestInstallation(c context.Context, db *gorm.DB) (models.GitHubInstallation, error) {
	var row models.GitHubInstallation
	if err := db.WithContext(c).Order("created_at desc").First(&row).Error; err != nil {
		return models.GitHubInstallation{}, err
	}
	return row, nil
}

func (s *Service) installationAccessToken(ctx context.Context, installationID int64) (string, time.Time, error) {
	if !s.hasAppCredentials() {
		return "", time.Time{}, errors.New("github app credentials are not configured")
	}
	jwToken, err := signGitHubAppJWT(s.appID, s.privateKey)
	if err != nil {
		return "", time.Time{}, err
	}
	endpoint := fmt.Sprintf("%s/app/installations/%d/access_tokens", s.apiBaseURL, installationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+jwToken)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", time.Time{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", time.Time{}, fmt.Errorf("github installation token request failed: %s", strings.TrimSpace(string(body)))
	}
	var parsed struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", time.Time{}, err
	}
	expiresAt, _ := time.Parse(time.RFC3339, parsed.ExpiresAt)
	if strings.TrimSpace(parsed.Token) == "" {
		return "", time.Time{}, errors.New("github installation token was empty")
	}
	return parsed.Token, expiresAt, nil
}

func (s *Service) InstallationAccessToken(ctx context.Context, installationID int64) (string, time.Time, error) {
	return s.installationAccessToken(ctx, installationID)
}
