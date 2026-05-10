package projects

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/models"
	"skyport/internal/response"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "projects" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableProjects {
		return nil
	}
	base := filepath.Join(a.Config.WorkspaceRoot, "projects")
	_ = os.MkdirAll(base, 0o755)

	r := a.Fiber.Group("/api/v1/projects")
	r.Get("/", listProjects(a))
	r.Post("/", createProject(a, base))
	r.Delete("/:id", deleteProject(a))
	return nil
}

type createProjectRequest struct {
	Name   string `json:"name" validate:"required,min=2,max=120"`
	GitURL string `json:"git_url" validate:"omitempty,max=1024"`
}

var slugRx = regexp.MustCompile(`[^a-zA-Z0-9-_]+`)

func createProject(a *app.App, base string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req createProjectRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		slug := strings.ToLower(strings.Trim(slugRx.ReplaceAllString(req.Name, "-"), "-"))
		if slug == "" {
			return response.BadRequest(c, "invalid project name")
		}
		path := filepath.Join(base, slug)
		if err := os.MkdirAll(path, 0o755); err != nil {
			return err
		}
		project := &models.Project{Name: req.Name, Path: path, GitURL: req.GitURL}
		if err := a.DB.Create(project).Error; err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, project)
	}
}

func listProjects(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var projects []models.Project
		if err := a.DB.Order("created_at DESC").Find(&projects).Error; err != nil {
			return err
		}
		return response.OK(c, projects)
	}
}

func deleteProject(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var project models.Project
		if err := a.DB.First(&project, id).Error; err != nil {
			return err
		}
		_ = os.RemoveAll(project.Path)
		if err := a.DB.Delete(&project).Error; err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"deleted": project.ID})
	}
}
