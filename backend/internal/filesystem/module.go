package filesystem

import (
	"io"
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

	r := a.Fiber.Group("/api/v1/files")
	r.Get("/", listHandler())
	r.Post("/folder", createFolderHandler())
	r.Delete("/", deleteHandler())
	r.Patch("/rename", renameHandler())
	r.Post("/upload", uploadHandler())
	r.Get("/download", downloadHandler())
	r.Post("/read", readFileHandler())
	return nil
}

type item struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

// listHandler returns the directory listing for any path on the VPS.
// @Summary List files
// @Tags Filesystem
// @Description List files and folders at an absolute path on the VPS
// @Produce json
// @Param path query string true "Absolute path on VPS (e.g., /home, C:\\Users on Windows)"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files [get]
func listHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		targetPath := strings.TrimSpace(c.Query("path"))
		if targetPath == "" {
			return response.BadRequest(c, "path query parameter is required")
		}

		targetPath = filepath.Clean(targetPath)

		entries, err := os.ReadDir(targetPath)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "read_failed", err.Error())
		}

		out := make([]item, 0, len(entries))
		for _, e := range entries {
			info, _ := e.Info()
			size := int64(0)
			if info != nil {
				size = info.Size()
			}
			fullPath := filepath.Join(targetPath, e.Name())
			out = append(out, item{
				Name:  e.Name(),
				Path:  filepath.ToSlash(fullPath),
				IsDir: e.IsDir(),
				Size:  size,
			})
		}
		return response.OK(c, fiber.Map{"path": targetPath, "items": out})
	}
}

type createFolderRequest struct {
	Path string `json:"path" validate:"required,max=2048"`
}

// createFolderHandler creates a directory at an absolute path on the VPS.
// @Summary Create folder
// @Tags Filesystem
// @Description Create a folder at an absolute path on the VPS
// @Accept json
// @Produce json
// @Param request body createFolderRequest true "Create folder payload"
// @Success 201 {object} map[string]string
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/folder [post]
func createFolderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req createFolderRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		path := filepath.Clean(req.Path)
		if err := os.MkdirAll(path, 0o755); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "mkdir_failed", err.Error())
		}

		return response.JSON(c, fiber.StatusCreated, fiber.Map{"path": path})
	}
}

// deleteHandler removes a file or folder at an absolute path on the VPS.
// @Summary Delete file or folder
// @Tags Filesystem
// @Description Deletes the file or folder at an absolute path
// @Produce json
// @Param path query string true "Absolute path to delete"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files [delete]
func deleteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		targetPath := strings.TrimSpace(c.Query("path"))
		if targetPath == "" {
			return response.BadRequest(c, "path query parameter is required")
		}

		path := filepath.Clean(targetPath)
		if err := os.RemoveAll(path); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "delete_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"deleted": path})
	}
}

type renameRequest struct {
	OldPath string `json:"old_path" validate:"required,max=2048"`
	NewPath string `json:"new_path" validate:"required,max=2048"`
}

// renameHandler renames a file or folder at absolute paths on the VPS.
// @Summary Rename file or folder
// @Tags Filesystem
// @Description Rename a file or folder using absolute paths
// @Accept json
// @Produce json
// @Param request body renameRequest true "Rename payload"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/rename [patch]
func renameHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req renameRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		oldPath := filepath.Clean(req.OldPath)
		newPath := filepath.Clean(req.NewPath)

		if err := os.Rename(oldPath, newPath); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "rename_failed", err.Error())
		}

		return response.OK(c, fiber.Map{"old_path": oldPath, "new_path": newPath})
	}
}

// uploadHandler handles multipart file uploads to an absolute path on the VPS.
// @Summary Upload file
// @Tags Filesystem
// @Description Upload a file to an absolute path on the VPS
// @Accept mpfd
// @Produce json
// @Param path formData string true "Absolute destination path on VPS"
// @Param file formData file true "File to upload"
// @Success 201 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/upload [post]
func uploadHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		destPath := strings.TrimSpace(c.FormValue("path"))
		if destPath == "" {
			return response.BadRequest(c, "path form field is required")
		}

		targetPath := filepath.Clean(destPath)

		// Get the uploaded file
		file, err := c.FormFile("file")
		if err != nil {
			return response.BadRequest(c, "file form field is required or invalid: "+err.Error())
		}

		// Create parent directory if needed
		parentDir := filepath.Dir(targetPath)
		if err := os.MkdirAll(parentDir, 0o755); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "mkdir_failed", err.Error())
		}

		// Open uploaded file
		src, err := file.Open()
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "file_open_failed", err.Error())
		}
		defer src.Close()

		// Create destination file
		dst, err := os.Create(targetPath)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "file_create_failed", err.Error())
		}
		defer dst.Close()

		// Copy file content
		if _, err := io.Copy(dst, src); err != nil {
			_ = os.Remove(targetPath) // Clean up on failure
			return response.Error(c, fiber.StatusInternalServerError, "copy_failed", err.Error())
		}

		// Set file permissions
		if err := os.Chmod(targetPath, 0o644); err != nil {
			// Log but don't fail if chmod fails
			_ = err
		}

		return response.JSON(c, fiber.StatusCreated, fiber.Map{
			"path": targetPath,
			"size": file.Size,
		})
	}
}

// downloadHandler streams a file from an absolute path on the VPS.
// @Summary Download file
// @Tags Filesystem
// @Description Download a file from an absolute path on the VPS
// @Produce octet-stream
// @Param path query string true "Absolute file path on VPS"
// @Success 200 {file} binary
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/download [get]
func downloadHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		filePath := strings.TrimSpace(c.Query("path"))
		if filePath == "" {
			return response.BadRequest(c, "path query parameter is required")
		}

		targetPath := filepath.Clean(filePath)

		info, err := os.Stat(targetPath)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "file_not_found", "file does not exist")
		}

		if info.IsDir() {
			return response.BadRequest(c, "cannot download a directory")
		}

		// Force download with Content-Disposition header
		filename := filepath.Base(targetPath)
		c.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

		// Let Fiber set Content-Type and stream file
		return c.SendFile(targetPath)
	}
}

type readFileRequest struct {
	Path string `json:"path" validate:"required,max=2048"`
}

// readFileHandler reads file content as text.
// @Summary Read file
// @Tags Filesystem
// @Description Read file content as text (for text files)
// @Accept json
// @Produce json
// @Param request body readFileRequest true "Read file payload"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/read [post]
func readFileHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req readFileRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		filePath := filepath.Clean(req.Path)

		info, err := os.Stat(filePath)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "file_not_found", "file does not exist")
		}

		if info.IsDir() {
			return response.BadRequest(c, "cannot read a directory")
		}

		// Limit file reads to 10MB to prevent memory issues
		if info.Size() > 10*1024*1024 {
			return response.Error(c, fiber.StatusRequestEntityTooLarge, "file_too_large", "file exceeds 10MB limit")
		}

		content, err := os.ReadFile(filePath)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "read_failed", err.Error())
		}

		return response.OK(c, fiber.Map{
			"path":    filePath,
			"size":    info.Size(),
			"content": string(content),
		})
	}
}
