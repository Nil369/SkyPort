package github

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"skyport/internal/capabilities"
	"skyport/internal/config"
	"skyport/internal/runtime"
)

type Service struct {
	httpClient *http.Client
	apiBase    string
	webBase    string
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
	return &Service{
		httpClient: &http.Client{Timeout: 20 * time.Second},
		apiBase:    strings.TrimRight(apiBase, "/"),
		webBase:    strings.TrimRight(webBase, "/"),
	}
}

func (s *Service) installURL(cfg *config.Config) string {
	slug := strings.TrimSpace(cfg.GitHubAppSlug)
	if slug == "" {
		slug = "skyportdeploy"
	}
	return fmt.Sprintf("%s/apps/%s/installations/new", s.webBase, slug)
}

func (s *Service) setupInfo(cfg *config.Config, installations []Installation) InstallInfo {
	recommended := "pat"
	if strings.TrimSpace(cfg.GitHubAppID) != "" && strings.TrimSpace(cfg.GitHubAppPrivateKey) != "" {
		recommended = "app"
	}
	return InstallInfo{
		AppName:          defaultIfEmpty(cfg.GitHubAppName, "SkyPort"),
		AppSlug:          defaultIfEmpty(cfg.GitHubAppSlug, "skyportdeploy"),
		AppInstallURL:    s.installURL(cfg),
		APIBaseURL:       s.apiBase,
		WebBaseURL:       s.webBase,
		HasAppConfig:     strings.TrimSpace(cfg.GitHubAppID) != "" && strings.TrimSpace(cfg.GitHubAppPrivateKey) != "",
		HasWebhookSecret: strings.TrimSpace(cfg.GitHubWebhookSecret) != "",
		FallbackModes:    []string{"pat", "ssh"},
		RecommendedMode:  recommended,
		Installations:    installations,
	}
}

func (s *Service) suggestionForRuntime(detect runtime.DetectionResult, cap capabilities.Snapshot) map[string]any {
	mode := "native"
	if cap.TotalRAMBytes >= 2*1024*1024*1024 {
		mode = "docker"
	} else if detect.Runtime == runtime.Node || detect.Runtime == runtime.Bun {
		mode = "pm2"
	}
	return map[string]any{
		"runtime":              string(detect.Runtime),
		"framework":            detect.Framework,
		"confidence":           detect.Confidence,
		"detected_port":        detect.DetectedPort,
		"working_directory":    detect.WorkingDirectory,
		"install_command":      detect.InstallCommand,
		"build_command":        detect.BuildCommand,
		"start_command":        detect.StartCommand,
		"recommended_mode":     mode,
		"ram_bytes":            cap.TotalRAMBytes,
		"ram_gb":               fmt.Sprintf("%.2f", float64(cap.TotalRAMBytes)/(1024*1024*1024)),
		"recommendation_notes": cap.RecommendationNotes,
	}
}

func (s *Service) detectAndSuggest(projectPath string) (runtime.DetectionResult, capabilities.Snapshot, map[string]any, error) {
	detect, err := runtime.NewDetector().Detect(projectPath)
	if err != nil {
		return runtime.DetectionResult{}, capabilities.Snapshot{}, nil, err
	}
	cap := capabilities.Detect(context.Background())
	return detect, cap, s.suggestionForRuntime(detect, cap), nil
}

func (s *Service) cloneRepository(ctx context.Context, targetPath, cloneURL, authType, sshKey, pat, branch string) error {
	if _, err := exec.LookPath("git"); err != nil {
		return errors.New("git executable not found on host")
	}
	cloneArgs := []string{"clone"}
	if strings.TrimSpace(branch) != "" {
		cloneArgs = append(cloneArgs, "--branch", strings.TrimSpace(branch))
	}

	cloneURL = strings.TrimSpace(cloneURL)
	if cloneURL == "" {
		return errors.New("clone url is required")
	}

	if authType == "pat" {
		parsed, err := url.Parse(cloneURL)
		if err != nil {
			return fmt.Errorf("invalid git url: %w", err)
		}
		if parsed.Scheme != "https" {
			return errors.New("pat auth requires an https git url")
		}
		if strings.TrimSpace(pat) == "" {
			return errors.New("git pat is required")
		}
		parsed.User = url.UserPassword("x-access-token", strings.TrimSpace(pat))
		cmd := exec.CommandContext(ctx, "git", append(cloneArgs, parsed.String(), targetPath)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to clone repository with pat: %w: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	if authType == "ssh" {
		if strings.TrimSpace(sshKey) == "" {
			return errors.New("ssh private key is required")
		}
		keyFile, err := os.CreateTemp("", "skyport-github-key-*.pem")
		if err != nil {
			return err
		}
		keyPath := keyFile.Name()
		if _, err := keyFile.WriteString(sshKey); err != nil {
			_ = keyFile.Close()
			_ = os.Remove(keyPath)
			return err
		}
		_ = keyFile.Close()
		_ = os.Chmod(keyPath, 0o600)
		defer func() { _ = os.Remove(keyPath) }()

		knownHosts := "/dev/null"
		if os.PathSeparator == '\\' {
			knownHosts = "NUL"
		}
		sshCmd := fmt.Sprintf("ssh -i %s -o StrictHostKeyChecking=no -o UserKnownHostsFile=%s", keyPath, knownHosts)
		cmd := exec.CommandContext(ctx, "git", append(cloneArgs, cloneURL, targetPath)...)
		cmd.Env = append(os.Environ(), "GIT_SSH_COMMAND="+sshCmd)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to clone repository with ssh key: %w: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	cmd := exec.CommandContext(ctx, "git", append(cloneArgs, cloneURL, targetPath)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to clone repository: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (s *Service) buildInstallationToken(ctx context.Context, cfg *config.Config, installationID int64) (string, time.Time, error) {
	if strings.TrimSpace(cfg.GitHubAppID) == "" || strings.TrimSpace(cfg.GitHubAppPrivateKey) == "" {
		return "", time.Time{}, errors.New("github app credentials are not configured")
	}
	jwt, err := signGitHubAppJWT(cfg.GitHubAppID, cfg.GitHubAppPrivateKey)
	if err != nil {
		return "", time.Time{}, err
	}
	endpoint := fmt.Sprintf("%s/app/installations/%d/access_tokens", s.apiBase, installationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", time.Time{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", time.Time{}, fmt.Errorf("github app access token request failed: %s", strings.TrimSpace(string(body)))
	}
	var parsed struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", time.Time{}, err
	}
	expiresAt, _ := time.Parse(time.RFC3339, parsed.ExpiresAt)
	return parsed.Token, expiresAt, nil
}

func signGitHubAppJWT(appID, pemKey string) (string, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return "", errors.New("github app private key is not valid pem")
	}
	keyAny, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		if rsaKey, rsaErr := x509.ParsePKCS1PrivateKey(block.Bytes); rsaErr == nil {
			keyAny = rsaKey
		} else {
			return "", err
		}
	}
	rsaKey, ok := keyAny.(*rsa.PrivateKey)
	if !ok {
		return "", errors.New("github app private key must be rsa")
	}
	now := time.Now().UTC()
	header := map[string]string{"alg": "RS256", "typ": "JWT"}
	payload := map[string]any{"iat": now.Unix() - 30, "exp": now.Add(9 * time.Minute).Unix(), "iss": appID}
	h, _ := json.Marshal(header)
	p, _ := json.Marshal(payload)
	enc := base64.RawURLEncoding
	unsigned := enc.EncodeToString(h) + "." + enc.EncodeToString(p)
	sum := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return unsigned + "." + enc.EncodeToString(sig), nil
}

func defaultIfEmpty(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
