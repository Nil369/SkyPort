package github

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/response"
)

type Module struct {
	service *Service
}

func NewModule(a *app.App) *Module {
	return &Module{service: NewService(a.Config)}
}

func (m *Module) Name() string { return "github" }

func (m *Module) Register(a *app.App) error {
	r := a.Fiber.Group("/api/v1/github")
	r.Get("/health", healthHandler(m.service))

	protected := a.Fiber.Group("/api/v1/github", auth.RequireJWT(a.Config.JWTSecret))
	protected.Post("/installations", saveInstallationHandler(a, m.service))
	protected.Get("/repositories", repositoriesHandler(a, m.service))

	// Compatibility helpers for existing frontend pages and GitHub settings screens.
	protected.Get("/bridge", bridgeInfoHandler(a, m.service))
	protected.Get("/setup", setupInfoHandler(a, m.service))
	protected.Get("/install", installInfoHandler(a, m.service))

	return nil
}

func healthHandler(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, HealthResponse{
			Status:           "ok",
			HasAppConfig:     svc.hasAppCredentials(),
			HasPrivateKey:    svc.hasAppCredentials(),
			BridgeURL:        svc.bridgeURL,
			GitHubAPIBaseURL: svc.apiBaseURL,
		})
	}
}

func saveInstallationHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req InstallationRequest
		if err := c.BodyParser(&req); err != nil {
			return response.BadRequest(c, "invalid request body")
		}
		installation, err := saveInstallation(c.UserContext(), a.DB, req.InstallationID)
		if err != nil {
			return response.Error(c, fiber.StatusBadRequest, "github_installation_save_failed", err.Error())
		}
		return response.JSON(c, fiber.StatusCreated, InstallationResponse{
			ID:             installation.ID,
			InstallationID: installation.InstallationID,
			CreatedAt:      installation.CreatedAt,
		})
	}
}

func repositoriesHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		installationID := int64(0)
		if raw := strings.TrimSpace(c.Query("installation_id")); raw != "" {
			parsed, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || parsed <= 0 {
				return response.BadRequest(c, "invalid installation_id")
			}
			installationID = parsed
		} else {
			installation, err := latestInstallation(c.UserContext(), a.DB)
			if err != nil {
				return response.Error(c, fiber.StatusNotFound, "github_installation_missing", "no GitHub installation has been saved yet")
			}
			installationID = installation.InstallationID
		}

		token, _, err := svc.installationAccessToken(c.UserContext(), installationID)
		if err != nil {
			return response.Error(c, fiber.StatusBadGateway, "github_installation_token_failed", err.Error())
		}
		repos, err := svc.listRepositories(c.UserContext(), token)
		if err != nil {
			return response.Error(c, fiber.StatusBadGateway, "github_repository_list_failed", err.Error())
		}
		return response.OK(c, RepositoryListResponse{Repositories: repos})
	}
}

func bridgeInfoHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, BridgeInfo{
			BridgeURL:     svc.bridgeURL,
			ConnectURL:    svc.bridgeConnectURL(c.Get("Origin")),
			HasAppConfig:  svc.hasAppCredentials(),
			HasPrivateKey: svc.hasAppCredentials(),
			AppID:         a.Config.GitHubAppID,
			GitHubBaseURL: svc.webBaseURL,
		})
	}
}

func setupInfoHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		installation, err := latestInstallation(c.UserContext(), a.DB)
		if err != nil {
			return response.OK(c, fiber.Map{
				"setup": fiber.Map{
					"bridge_url":     svc.bridgeURL,
					"has_app_config": svc.hasAppCredentials(),
				},
				"connections":    []any{},
				"recommendation": "app",
			})
		}
		return response.OK(c, fiber.Map{
			"setup": fiber.Map{
				"bridge_url":     svc.bridgeURL,
				"has_app_config": svc.hasAppCredentials(),
			},
			"connections": []any{fiber.Map{
				"installation_id": installation.InstallationID,
				"connected":       true,
			}},
			"recommendation": "app",
		})
	}
}

func installInfoHandler(a *app.App, svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{
			"install": svc.bridgeConnectURL(c.Get("Origin")),
			"setup": fiber.Map{
				"bridge_url":     svc.bridgeURL,
				"has_app_config": svc.hasAppCredentials(),
			},
			"app_name": a.Config.GitHubAppName,
		})
	}
}
