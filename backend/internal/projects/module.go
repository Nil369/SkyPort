package projects

import (
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
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
	r.Use(auth.RequireJWT(a.Config.JWTSecret))
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
	GitBranch string `json:"git_branch" validate:"omitempty,max=255"`
}

var slugRx = regexp.MustCompile(`[^a-zA-Z0-9-_]+`)

// createProject creates a new project entry and workspace folder.
// @Summary Create project
// @Tags Projects
// @Description Create project folder and DB row. git_url public (HTTPS): omit git_auth_type, e.g. https://github.com/org/repo.git. Private: git_auth_type pat plus git_pat, or ssh plus git_ssh_key; optional git_branch. Then deploy with POST /api/v1/deployments and project id.
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body createProjectRequest true "Create project payload"
// @Success 201 {object} models.Project
// @Failure 400 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
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
			if err := gitCloneRepoWithAuth(req.GitURL, path, req.GitAuth, req.GitSSHKey, req.GitPAT, req.GitBranch); err != nil {
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
func gitCloneRepoWithAuth(gitURL, targetPath, authType, sshKey, pat, branch string) error {
	if _, err := exec.LookPath("git"); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "git executable not found on host")
	}
	cloneArgs := []string{"clone"}
	if strings.TrimSpace(branch) != "" {
		cloneArgs = append(cloneArgs, "--branch", strings.TrimSpace(branch))
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
		if strings.TrimSpace(pat) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "git_pat is required for pat auth")
		}
		parsed.User = url.UserPassword("x-access-token", pat)
		authURL := parsed.String()
		cmd := exec.Command("git", append(cloneArgs, authURL, targetPath)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository with PAT: "+err.Error()+": "+string(out))
		}
		return nil
	}

	if authType == "ssh" {
		if sshKey == "" {
			return fiber.NewError(fiber.StatusBadRequest, "ssh key required for ssh auth")
		}
		keyFile, err := os.CreateTemp("", "git_ssh_key_")
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

		knownHosts := "/dev/null"
		if runtime.GOOS == "windows" {
			knownHosts = "NUL"
		}
		sshCmd := "ssh -i " + keyPath + " -o StrictHostKeyChecking=no -o UserKnownHostsFile=" + knownHosts
		cmd := exec.Command("git", append(cloneArgs, gitURL, targetPath)...)
		cmd.Env = append(os.Environ(), "GIT_SSH_COMMAND="+sshCmd)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository with SSH key: "+err.Error()+": "+string(out))
		}
		return nil
	}

	if authType == "" {
		cmd := exec.Command("git", append(cloneArgs, gitURL, targetPath)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "failed to clone repository: "+err.Error()+": "+string(out))
		}
		return nil
	}

	return fiber.NewError(fiber.StatusBadRequest, "unsupported git auth type")
}

// listProjects returns all projects.
// @Summary List projects
// @Tags Projects
// @Description Returns list of projects
// @Security BearerAuth
// @Produce json
// @Success 200 {array} models.Project
// @Failure 401 {object} response.ErrorBody
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
// @Security BearerAuth
// @Produce json
// @Param id path string true "Project ID"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Failure 401 {object} response.ErrorBody
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
