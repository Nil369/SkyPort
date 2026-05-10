package projects

import (
	"io/ioutil"
	"net/url"
	"os"
	"os/exec"
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
	Name      string `json:"name" validate:"required,min=2,max=120"`
	GitURL    string `json:"git_url" validate:"omitempty,max=1024"`
	Private   bool   `json:"private" validate:"omitempty"`
	GitAuth   string `json:"git_auth_type" validate:"omitempty,oneof=ssh pat"`
	GitSSHKey string `json:"git_ssh_key" validate:"omitempty"`
	GitPAT    string `json:"git_pat" validate:"omitempty"`
}

var slugRx = regexp.MustCompile(`[^a-zA-Z0-9-_]+`)

// createProject creates a new project entry and workspace folder.
// @Summary Create project
// @Tags Projects
// @Description Create a new project record and workspace directory. If git_url is provided, clones the repository (public repos only for now).
// @Accept json
// @Produce json
// @Param request body createProjectRequest true "Create project payload"
// @Success 201 {object} models.Project
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/projects [post]
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

		// If GitURL provided, attempt to clone the repository
		if req.GitURL != "" {
			if err := gitCloneRepoWithAuth(req.GitURL, path, req.GitAuth, req.GitSSHKey, req.GitPAT); err != nil {
				// Clean up directory on git clone failure
				_ = os.RemoveAll(path)
				return response.Error(c, fiber.StatusBadRequest, "git_clone_failed", err.Error())
			}
		}

		project := &models.Project{Name: req.Name, Path: path, GitURL: req.GitURL}
		if err := a.DB.Create(project).Error; err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, project)
	}
}

// gitCloneRepo clones a public git repository to the specified path.
// gitCloneRepoWithAuth clones a repository, supporting SSH key or PAT for private repos.
func gitCloneRepoWithAuth(gitURL, targetPath, authType, sshKey, pat string) error {
	// Default: simple clone
	if authType == "" {
		cmd := exec.Command("git", "clone", gitURL, targetPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository: "+err.Error()+": "+string(out))
		}
		return nil
	}

	if authType == "pat" {
		// Insert PAT into HTTPS URL
		parsed, err := url.Parse(gitURL)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid git URL")
		}
		if parsed.Scheme != "https" {
			return fiber.NewError(fiber.StatusBadRequest, "PAT auth requires HTTPS git URL")
		}
		// Use token as username with empty password
		parsed.User = url.UserPassword(pat, "")
		authURL := parsed.String()
		cmd := exec.Command("git", "clone", authURL, targetPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository with PAT: "+err.Error()+": "+string(out))
		}
		return nil
	}

	if authType == "ssh" {
		if sshKey == "" {
			return fiber.NewError(fiber.StatusBadRequest, "ssh key required for ssh auth")
		}
		// Write ssh key to temp file
		keyFile, err := ioutil.TempFile("", "git_ssh_key_")
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "failed to create temp key file: "+err.Error())
		}
		keyPath := keyFile.Name()
		if _, err := keyFile.Write([]byte(sshKey)); err != nil {
			_ = keyFile.Close()
			_ = os.Remove(keyPath)
			return fiber.NewError(fiber.StatusInternalServerError, "failed to write ssh key: "+err.Error())
		}
		_ = keyFile.Close()
		_ = os.Chmod(keyPath, 0o600)
		defer func() {
			_ = os.Remove(keyPath)
		}()

		// Use GIT_SSH_COMMAND to point to ssh with the key
		sshCmd := "ssh -i " + keyPath + " -o StrictHostKeyChecking=no"
		cmd := exec.Command("git", "-c", "core.sshCommand=\""+sshCmd+"\"", "clone", gitURL, targetPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository with SSH key: "+err.Error()+": "+string(out))
		}
		return nil
	}

	return fiber.NewError(fiber.StatusBadRequest, "unsupported git auth type")
}

// listProjects returns all projects.
// @Summary List projects
// @Tags Projects
// @Description Returns list of projects
// @Produce json
// @Success 200 {array} models.Project
// @Router /api/v1/projects [get]
func listProjects(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var projects []models.Project
		if err := a.DB.Order("created_at DESC").Find(&projects).Error; err != nil {
			return err
		}
		return response.OK(c, projects)
	}
}

// deleteProject deletes a project by database ID.
// @Summary Delete project
// @Tags Projects
// @Description Delete a project by ID
// @Produce json
// @Param id path string true "Project ID"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/projects/{id} [delete]
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
