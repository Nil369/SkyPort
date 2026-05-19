package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/capabilities"
	"skyport/internal/models"
	"skyport/internal/response"
	"skyport/internal/runtime"
	"skyport/internal/validator"

	"gorm.io/gorm"
)

type Module struct {
	service *Service
}

func NewModule(cfg *app.App) *Module {
	return &Module{service: NewService(cfg.Config)}
}

func (m *Module) Name() string { return "github" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/github", auth.RequireJWT(a.Config.JWTSecret))
	r.Get("/install", githubInstallHandler(a, m.service))
	r.Get("/setup", githubSetupHandler(a, m.service))
	r.Post("/connect", githubConnectHandler(a))
	r.Get("/repositories", githubRepositoriesHandler(a, m.service))
	r.Post("/import", githubImportHandler(a, m.service))
	r.Post("/disconnect", githubDisconnectHandler(a))
	r.Post("/webhook", githubWebhookPlaceholder())
	return nil
}

func githubInstallHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}
		installations := make([]Installation, 0, 4)
		_ = a.DB.Model(&models.GitHubInstallation{}).
			Where("user_id = ?", userID).
			Order("updated_at desc").
			Limit(8).
			Find(&installations).Error
		return response.OK(c, fiber.Map{"install": svc.installURL(a.Config), "setup": svc.setupInfo(a.Config, installations)})
	}
}

func githubSetupHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}
		installations, _ := loadInstallations(a.DB, userID)
		connections, _ := loadConnections(a.DB, userID)
		return response.OK(c, fiber.Map{
			"setup":          svc.setupInfo(a.Config, installations),
			"connections":    connections,
			"recommendation": capabilities.Detect(c.UserContext()).Recommendation,
		})
	}
}

func githubRepositoriesHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}
		installID := parseUintQuery(c.Query("installation_id"))
		search := strings.ToLower(strings.TrimSpace(c.Query("q")))
		selectedOnly := c.Query("selected") == "1"
		refresh := c.Query("refresh") == "1"

		if refresh {
			if err := syncRepositories(c.UserContext(), a, svc, userID, installID); err != nil && !errorsIsAuth(err) {
				return response.Error(c, http.StatusBadGateway, "github_sync_failed", err.Error())
			}
		}

		repos, err := loadRepositories(a.DB, userID, installID)
		if err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_repo_list_failed", err.Error())
		}
		out := make([]Repository, 0, len(repos))
		for _, repo := range repos {
			if selectedOnly && !repo.Selected {
				continue
			}
			if search != "" && !strings.Contains(strings.ToLower(repo.FullName+" "+repo.Description+" "+repo.Language+" "+repo.Framework), search) {
				continue
			}
			out = append(out, repo)
		}
		return response.OK(c, fiber.Map{"repositories": out})
	}
}

func githubConnectHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req ConnectRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}
		connection, installation, err := upsertConnection(a.DB, userID, ImportRequest{
			AuthType:       req.AuthType,
			InstallationID: req.InstallationID,
			PAT:            req.PAT,
			SSHPrivateKey:  req.SSHPrivateKey,
		})
		if err != nil {
			return response.Error(c, http.StatusBadRequest, "github_connect_failed", err.Error())
		}
		installations, _ := loadInstallations(a.DB, userID)
		repos, _ := loadRepositories(a.DB, userID, 0)
		payload := ConnectResponse{
			Connection: map[string]any{
				"id":              connection.ID,
				"auth_type":       connection.AuthType,
				"installation_id": connection.InstallationID,
				"connected":       connection.Connected,
				"account_login":   connection.AccountLogin,
				"account_type":    connection.AccountType,
			},
			Repositories:  len(repos),
			Installations: len(installations),
		}
		if installation.ID > 0 {
			payload.Installation = map[string]any{
				"id":              installation.ID,
				"installation_id": installation.InstallationID,
				"status":          installation.Status,
			}
		}
		return response.JSON(c, http.StatusCreated, payload)
	}
}

func githubImportHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req ImportRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}

		connection, installation, err := upsertConnection(a.DB, userID, req)
		if err != nil {
			return response.Error(c, http.StatusBadRequest, "github_connection_failed", err.Error())
		}

		repo := Repository{
			RepositoryID:   req.RepositoryID,
			InstallationID: installation.ID,
			FullName:       strings.TrimSpace(req.FullName),
			Name:           defaultIfEmpty(req.Name, pathBase(req.FullName)),
			Owner:          defaultIfEmpty(req.Owner, strings.Split(req.FullName, "/")[0]),
			CloneURL:       strings.TrimSpace(req.CloneURL),
			SSHURL:         strings.TrimSpace(req.SSHURL),
			DefaultBranch:  branchOrDefault(req.Branch, "main"),
			SelectedBranch: branchOrDefault(req.Branch, "main"),
			Private:        strings.TrimSpace(req.AuthType) != "",
			Selected:       true,
			DeploymentMode: strings.TrimSpace(req.DeploymentMode),
		}
		if repo.CloneURL == "" && repo.SSHURL != "" {
			repo.CloneURL = repo.SSHURL
		}
		if repo.CloneURL == "" {
			repo.CloneURL = fmt.Sprintf("https://github.com/%s.git", repo.FullName)
		}

		projectName := strings.TrimSpace(req.ProjectName)
		if projectName == "" {
			projectName = repo.Name
		}
		slug := slugify(projectName)
		if slug == "" {
			slug = slugify(repo.Name)
		}
		projectBase := filepath.Join(a.Config.WorkspaceRoot, "projects")
		_ = os.MkdirAll(projectBase, 0o755)
		targetPath := filepath.Join(projectBase, slug)
		if err := os.RemoveAll(targetPath); err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_import_failed", err.Error())
		}
		if err := os.MkdirAll(targetPath, 0o755); err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_import_failed", err.Error())
		}

		authType := strings.TrimSpace(req.AuthType)
		if authType == "" {
			authType = strings.ToLower(strings.TrimSpace(connection.AuthType))
		}
		if authType == "app" && installation.InstallationID > 0 {
			token, expiresAt, tokenErr := svc.buildInstallationToken(c.UserContext(), a.Config, installation.InstallationID)
			if tokenErr == nil && token != "" {
				installation.AccessToken = token
				installation.TokenExpiresAt = &expiresAt
				_ = a.DB.Save(&installation).Error
			}
		}

		if err := svc.cloneRepository(c.UserContext(), targetPath, repo.CloneURL, authType, req.SSHPrivateKey, req.PAT, repo.SelectedBranch); err != nil {
			_ = os.RemoveAll(targetPath)
			return response.Error(c, http.StatusBadRequest, "github_clone_failed", err.Error())
		}

		detect, capSnap, suggestion, err := svc.detectAndSuggest(targetPath)
		if err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_detect_failed", err.Error())
		}

		if req.DeploymentMode == "" {
			repo.DeploymentMode = strings.TrimSpace(fmt.Sprint(suggestion["recommended_mode"]))
		} else {
			repo.DeploymentMode = req.DeploymentMode
		}
		repo.Runtime = string(detect.Runtime)
		repo.Framework = detect.Framework
		repo.Language = string(detect.Runtime)

		recordRepoCache(a.DB, installation.ID, repo, detect, repo.DeploymentMode)

		project := models.Project{Name: projectName, Path: targetPath, GitURL: repo.CloneURL, Private: repo.Private}
		if err := a.DB.Create(&project).Error; err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_project_failed", err.Error())
		}

		return response.JSON(c, http.StatusCreated, ImportResponse{
			Project: map[string]any{
				"id":   project.ID,
				"name": project.Name,
				"path": project.Path,
			},
			Repository: repo,
			Runtime: map[string]any{
				"runtime":     string(detect.Runtime),
				"framework":   detect.Framework,
				"confidence":  detect.Confidence,
				"working_dir": detect.WorkingDirectory,
				"install_cmd": detect.InstallCommand,
				"build_cmd":   detect.BuildCommand,
				"start_cmd":   detect.StartCommand,
				"ram_bytes":   capSnap.TotalRAMBytes,
				"ram_notes":   capSnap.RecommendationNotes,
			},
			DeploymentSuggestion: suggestion,
			Connection: map[string]any{
				"id":              connection.ID,
				"auth_type":       connection.AuthType,
				"installation_id": connection.InstallationID,
				"connected":       connection.Connected,
			},
		})
	}
}

func githubDisconnectHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := auth.UserIDFromCtx(c)
		if err != nil {
			return response.Unauthorized(c, "authentication required")
		}
		var installations []models.GitHubInstallation
		_ = a.DB.Where("user_id = ?", userID).Find(&installations).Error
		ids := make([]uint, 0, len(installations))
		for _, installation := range installations {
			ids = append(ids, installation.ID)
		}
		if len(ids) > 0 {
			_ = a.DB.Where("installation_id IN ?", ids).Delete(&models.GitHubRepository{}).Error
		}
		if err := a.DB.Where("user_id = ?", userID).Delete(&models.GitHubConnection{}).Error; err != nil {
			return response.Error(c, http.StatusInternalServerError, "github_disconnect_failed", err.Error())
		}
		_ = a.DB.Where("user_id = ?", userID).Delete(&models.GitHubInstallation{}).Error
		return response.OK(c, fiber.Map{"disconnected": true})
	}
}

func githubWebhookPlaceholder() fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{"status": "accepted", "message": "github webhook processing is wired in a future iteration"})
	}
}

func upsertConnection(db *gorm.DB, userID uint, req ImportRequest) (models.GitHubConnection, models.GitHubInstallation, error) {
	conn := models.GitHubConnection{}
	if req.ConnectionID > 0 {
		_ = db.First(&conn, req.ConnectionID).Error
	}
	if conn.ID == 0 {
		conn = models.GitHubConnection{UserID: userID, Provider: "github"}
	}
	if req.AuthType != "" {
		conn.AuthType = req.AuthType
	}
	if strings.TrimSpace(req.PAT) != "" {
		conn.AccessToken = req.PAT
		conn.AuthType = "pat"
	}
	if strings.TrimSpace(req.SSHPrivateKey) != "" {
		conn.SSHPrivateKey = req.SSHPrivateKey
		conn.AuthType = "ssh"
	}
	conn.Connected = true
	if err := db.Save(&conn).Error; err != nil {
		return models.GitHubConnection{}, models.GitHubInstallation{}, err
	}

	installation := models.GitHubInstallation{UserID: userID, InstallationID: req.InstallationID, Status: "active"}
	if req.InstallationID > 0 {
		_ = db.Where("installation_id = ?", req.InstallationID).FirstOrCreate(&installation).Error
		installation.UserID = userID
		if conn.InstallationID != req.InstallationID {
			conn.InstallationID = req.InstallationID
			_ = db.Save(&conn).Error
		}
	}
	return conn, installation, nil
}

func loadInstallations(db *gorm.DB, userID uint) ([]Installation, error) {
	var rows []models.GitHubInstallation
	if err := db.Where("user_id = ?", userID).Order("updated_at desc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Installation, 0, len(rows))
	for _, row := range rows {
		out = append(out, Installation{ID: row.ID, InstallationID: row.InstallationID, AccountLogin: row.AccountLogin, AccountType: row.AccountType, Status: row.Status, LastSyncedAt: row.LastSyncedAt})
	}
	return out, nil
}

func loadConnections(db *gorm.DB, userID uint) ([]map[string]any, error) {
	var rows []models.GitHubConnection
	if err := db.Where("user_id = ?", userID).Order("updated_at desc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{"id": row.ID, "auth_type": row.AuthType, "installation_id": row.InstallationID, "connected": row.Connected, "account_login": row.AccountLogin, "account_type": row.AccountType})
	}
	return out, nil
}

func loadRepositories(db *gorm.DB, userID uint, installationID uint) ([]Repository, error) {
	q := db.Model(&models.GitHubRepository{})
	if installationID > 0 {
		q = q.Where("installation_id = ?", installationID)
	}
	q = q.Joins("JOIN github_installations ON github_installations.id = github_repositories.installation_id").Where("github_installations.user_id = ?", userID)
	var rows []models.GitHubRepository
	if err := q.Order("updated_at desc").Limit(200).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Repository, 0, len(rows))
	for _, row := range rows {
		out = append(out, Repository{ID: row.ID, RepositoryID: row.RepositoryID, InstallationID: row.InstallationID, FullName: row.FullName, Name: row.Name, Owner: row.Owner, OwnerType: row.OwnerType, Private: row.Private, Fork: row.Fork, DefaultBranch: row.DefaultBranch, SelectedBranch: row.SelectedBranch, CloneURL: row.CloneURL, SSHURL: row.SSHURL, HomepageURL: row.HomepageURL, Description: row.Description, Language: row.Language, Runtime: row.Runtime, Framework: row.Framework, DeploymentMode: row.DeploymentMode, Selected: row.Selected, LastSyncedAt: row.LastSyncedAt})
	}
	return out, nil
}

func syncRepositories(ctx context.Context, a *app.App, svc *Service, userID uint, installationID uint) error {
	var installation models.GitHubInstallation
	q := a.DB.Where("user_id = ?", userID)
	if installationID > 0 {
		q = q.Where("installation_id = ?", installationID)
	}
	if err := q.Order("updated_at desc").First(&installation).Error; err != nil {
		return err
	}
	var conn models.GitHubConnection
	if err := a.DB.Where("user_id = ?", userID).Order("updated_at desc").First(&conn).Error; err != nil {
		return err
	}
	token := strings.TrimSpace(conn.AccessToken)
	if token == "" && installation.InstallationID > 0 {
		var tokErr error
		token, _, tokErr = svc.buildInstallationToken(ctx, a.Config, installation.InstallationID)
		if tokErr != nil {
			return tokErr
		}
	}
	if token == "" {
		return errors.New("no github access token available")
	}

	endpoint := fmt.Sprintf("%s/user/repos?per_page=100&sort=updated", svc.apiBase)
	repos, err := fetchGitHubRepos(ctx, svc.httpClient, endpoint, token)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, repo := range repos {
		record := models.GitHubRepository{
			InstallationID: installation.ID,
			RepositoryID:   repo.RepositoryID,
			FullName:       repo.FullName,
			Name:           repo.Name,
			Owner:          repo.Owner,
			OwnerType:      repo.OwnerType,
			Private:        repo.Private,
			Fork:           repo.Fork,
			DefaultBranch:  repo.DefaultBranch,
			SelectedBranch: repo.SelectedBranch,
			CloneURL:       repo.CloneURL,
			SSHURL:         repo.SSHURL,
			HomepageURL:    repo.HomepageURL,
			Description:    repo.Description,
			Language:       repo.Language,
			Runtime:        repo.Runtime,
			Framework:      repo.Framework,
			DeploymentMode: repo.DeploymentMode,
			Selected:       repo.Selected,
			LastSyncedAt:   &now,
		}
		_ = a.DB.Where("installation_id = ? AND repository_id = ?", installation.ID, repo.RepositoryID).Assign(record).FirstOrCreate(&record).Error
	}
	installation.LastSyncedAt = &now
	installation.Status = "active"
	installation.AccessToken = token
	_ = a.DB.Save(&installation).Error
	return nil
}

func fetchGitHubRepos(ctx context.Context, client *http.Client, endpoint, token string) ([]Repository, error) {
	var all []Repository
	for page := 1; page < 20; page++ {
		pageURL := endpoint + "&page=" + strconv.Itoa(page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("github repo fetch failed: %s", strings.TrimSpace(string(body)))
		}
		var raw []map[string]any
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			break
		}
		for _, r := range raw {
			repo := Repository{
				RepositoryID:  int64(numberValue(r["id"])),
				FullName:      stringValue(r["full_name"]),
				Name:          stringValue(r["name"]),
				Owner:         stringValueMap(r, "owner", "login"),
				OwnerType:     stringValueMap(r, "owner", "type"),
				Private:       boolValue(r["private"]),
				Fork:          boolValue(r["fork"]),
				DefaultBranch: stringValue(r["default_branch"]),
				CloneURL:      stringValue(r["clone_url"]),
				SSHURL:        stringValue(r["ssh_url"]),
				HomepageURL:   stringValue(r["homepage"]),
				Description:   stringValue(r["description"]),
				Language:      stringValue(r["language"]),
			}
			all = append(all, repo)
		}
		if len(raw) < 100 {
			break
		}
	}
	return all, nil
}

func recordRepoCache(db *gorm.DB, installationID uint, repo Repository, detect runtime.DetectionResult, deploymentMode string) {
	row := models.GitHubRepository{
		InstallationID: installationID,
		RepositoryID:   repo.RepositoryID,
		FullName:       repo.FullName,
		Name:           repo.Name,
		Owner:          repo.Owner,
		OwnerType:      repo.OwnerType,
		Private:        repo.Private,
		Fork:           repo.Fork,
		DefaultBranch:  repo.DefaultBranch,
		SelectedBranch: repo.SelectedBranch,
		CloneURL:       repo.CloneURL,
		SSHURL:         repo.SSHURL,
		HomepageURL:    repo.HomepageURL,
		Description:    repo.Description,
		Language:       repo.Language,
		Runtime:        string(detect.Runtime),
		Framework:      detect.Framework,
		DeploymentMode: deploymentMode,
		Selected:       repo.Selected,
	}
	_ = db.Where("installation_id = ? AND repository_id = ?", installationID, repo.RepositoryID).Assign(row).FirstOrCreate(&row).Error
}

func parseUintQuery(raw string) uint {
	if strings.TrimSpace(raw) == "" {
		return 0
	}
	v, _ := strconv.ParseUint(raw, 10, 64)
	return uint(v)
}

func branchOrDefault(branch, fallback string) string {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return fallback
	}
	return branch
}

func pathBase(fullName string) string {
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		return "repository"
	}
	parts := strings.Split(fullName, "/")
	return parts[len(parts)-1]
}

func slugify(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return ""
	}
	var b strings.Builder
	lastDash := false
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func stringValue(v any) string {
	s, _ := v.(string)
	return s
}

func stringValueMap(v map[string]any, key, nested string) string {
	if sub, ok := v[key].(map[string]any); ok {
		return stringValue(sub[nested])
	}
	return ""
}

func boolValue(v any) bool {
	b, _ := v.(bool)
	return b
}

func numberValue(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}

func errorsIsAuth(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "token") || strings.Contains(msg, "unauthorized") || strings.Contains(msg, "forbidden")
}
