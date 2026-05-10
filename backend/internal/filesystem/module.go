package filesystem

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
	"skyport/internal/validator"
)

type Module struct{}

func (m *Module) Name() string { return "filesystem" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableFilesystem {
		return nil
	}
	root := filepath.Clean(a.Config.WorkspaceRoot)
	_ = os.MkdirAll(root, 0o755)

	r := a.Fiber.Group("/api/v1/files")
	r.Get("/", listHandler(root))
	r.Post("/folder", createFolderHandler(root))
	r.Delete("/", deleteHandler(root))
	r.Patch("/rename", renameHandler(root))
	r.Post("/upload", func(c *fiber.Ctx) error {
		return response.Error(c, fiber.StatusNotImplemented, "upload_not_implemented", "upload endpoint placeholder")
	})
	return nil
}

type item struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

func listHandler(root string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path, err := safeJoin(root, c.Query("path"))
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			return err
		}
		out := make([]item, 0, len(entries))
		for _, e := range entries {
			info, _ := e.Info()
			size := int64(0)
			if info != nil {
				size = info.Size()
			}
			out = append(out, item{Name: e.Name(), Path: filepath.ToSlash(filepath.Join(c.Query("path"), e.Name())), IsDir: e.IsDir(), Size: size})
		}
		return response.OK(c, fiber.Map{"root": root, "path": c.Query("path"), "items": out})
	}
}

type createFolderRequest struct {
	Path string `json:"path" validate:"required,max=2048"`
}

func createFolderHandler(root string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req createFolderRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		path, err := safeJoin(root, req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		if err := os.MkdirAll(path, 0o755); err != nil {
			return err
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{"path": req.Path})
	}
}

func deleteHandler(root string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path, err := safeJoin(root, c.Query("path"))
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		if err := os.RemoveAll(path); err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"deleted": c.Query("path")})
	}
}

type renameRequest struct {
	OldPath string `json:"old_path" validate:"required,max=2048"`
	NewPath string `json:"new_path" validate:"required,max=2048"`
}

func renameHandler(root string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req renameRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		oldPath, err := safeJoin(root, req.OldPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		newPath, err := safeJoin(root, req.NewPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		if err := os.Rename(oldPath, newPath); err != nil {
			return err
		}
		return response.OK(c, fiber.Map{"old_path": req.OldPath, "new_path": req.NewPath})
	}
}

func safeJoin(root, requestPath string) (string, error) {
	clean := filepath.Clean("/" + strings.TrimSpace(requestPath))
	target := filepath.Join(root, clean)
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(rel, "..") {
		return "", fiber.NewError(fiber.StatusBadRequest, "path escapes workspace root")
	}
	return target, nil
}
