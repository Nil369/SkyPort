package filesystem

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

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
	r.Post("/convert", convertHandler())
	r.Post("/folder", createFolderHandler())
	r.Delete("/", deleteHandler())
	r.Patch("/rename", renameHandler())
	r.Post("/upload", uploadHandler())
	r.Get("/download", downloadHandler())
	r.Post("/read", readFileHandler())
	r.Post("/file", createFileHandler())
	r.Put("/write", writeFileHandler())
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
// @Param path query string true "Absolute path on VPS (use / on Linux, and G:/folder or escaped G:\\\\folder in JSON)"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files [get]
func listHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		targetPath := strings.TrimSpace(c.Query("path"))
		if targetPath == "" {
			return response.BadRequest(c, "path query parameter is required")
		}

		var err error
		targetPath, err = normalizeAbsolutePath(targetPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

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
// @Param request body createFolderRequest true "Create folder payload (use forward slashes or escaped backslashes on Windows)"
// @Success 201 {object} map[string]string
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/folder [post]
func createFolderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req createFolderRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		path, err := normalizeAbsolutePath(req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
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

		path, err := normalizeAbsolutePath(targetPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
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

		oldPath, err := normalizeAbsolutePath(req.OldPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		newPath, err := normalizeAbsolutePath(req.NewPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

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

		targetPath, err := normalizeAbsolutePath(destPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

		relativePath := strings.TrimSpace(c.FormValue("relative_path"))
		if relativePath == "" {
			relativePath = strings.TrimSpace(c.FormValue("relativePath"))
		}

		// Get the uploaded file
		file, err := c.FormFile("file")
		if err != nil {
			return response.BadRequest(c, "file form field is required or invalid: "+err.Error())
		}
		if relativePath != "" {
			relativePath = strings.ReplaceAll(relativePath, "\\", "/")
			relativePath = strings.TrimPrefix(relativePath, "/")
			targetPath = filepath.Join(targetPath, filepath.FromSlash(relativePath))
		}

		// If path is a folder, save using uploaded filename.
		if strings.HasSuffix(destPath, "/") || strings.HasSuffix(destPath, `\`) {
			targetPath = filepath.Join(targetPath, filepath.Base(file.Filename))
		} else if st, err := os.Stat(targetPath); err == nil && st.IsDir() {
			targetPath = filepath.Join(targetPath, filepath.Base(file.Filename))
		}

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
		rawPath := strings.TrimSpace(c.Query("path"))
		if rawPath == "" {
			return response.BadRequest(c, "path query parameter is required")
		}

		targetPath, err := normalizeAbsolutePath(rawPath)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

		info, err := os.Stat(targetPath)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "file_not_found", "file does not exist")
		}

		if info.IsDir() {
			zipPath, err := zipDirectory(targetPath)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "zip_failed", err.Error())
			}
			defer os.Remove(zipPath)
			return c.Download(zipPath, filepath.Base(targetPath)+".zip")
		}

		if c.Query("inline") == "1" {
			c.Type(filepath.Ext(targetPath))
			return c.SendFile(targetPath)
		}

		// Force download with Content-Disposition header for non-preview flows.
		filename := filepath.Base(targetPath)
		c.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

		return c.Download(targetPath, filename)
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

		filePath, err := normalizeAbsolutePath(req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

		info, err := os.Stat(filePath)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "file_not_found", "file does not exist")
		}

		if info.IsDir() {
			return response.BadRequest(c, "cannot read a directory")
		}

		const previewLimit = 2 * 1024 * 1024 // 2MB inline preview for huge files
		truncated := false
		var content []byte
		if info.Size() > previewLimit {
			f, err := os.Open(filePath)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "read_failed", err.Error())
			}
			defer f.Close()
			buf := make([]byte, previewLimit)
			n, rerr := f.Read(buf)
			if rerr != nil && rerr != io.EOF {
				return response.Error(c, fiber.StatusInternalServerError, "read_failed", rerr.Error())
			}
			content = buf[:n]
			truncated = true
		} else {
			var err error
			content, err = os.ReadFile(filePath)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "read_failed", err.Error())
			}
		}

		contentType := mime.TypeByExtension(filepath.Ext(filePath))
		if contentType == "" {
			contentType = http.DetectContentType(content)
		}
		if !utf8.Valid(content) {
			encoded := base64.StdEncoding.EncodeToString(content)
			return response.OK(c, fiber.Map{
				"path":         filePath,
				"size":         info.Size(),
				"content_type": contentType,
				"encoding":     "base64",
				"preview":      encoded,
				"truncated":    truncated,
				"message":      "binary file detected; content returned as base64",
			})
		}

		return response.OK(c, fiber.Map{
			"path":         filePath,
			"size":         info.Size(),
			"content_type": contentType,
			"encoding":     "utf-8",
			"content":      string(content),
			"truncated":    truncated,
		})
	}
}

type createFileRequest struct {
	Path     string `json:"path" validate:"required,max=2048"`
	Filename string `json:"filename" validate:"omitempty,max=255"`
	Title    string `json:"title" validate:"omitempty,max=255"`
	Content  string `json:"content" validate:"omitempty,max=50000000"`
}

// createFileHandler creates a file and parent folders if needed.
// @Summary Create file
// @Tags Filesystem
// @Description Create file at absolute path; creates parent directories automatically
// @Accept json
// @Produce json
// @Param request body createFileRequest true "Create file payload (path may be file or folder; filename/title optional)"
// @Success 201 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/file [post]
func createFileHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req createFileRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		basePath, err := normalizeAbsolutePath(req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		targetPath := resolveFileTarget(basePath, req.Filename, req.Title)
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "mkdir_failed", err.Error())
		}
		if err := os.WriteFile(targetPath, []byte(req.Content), 0o644); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "write_failed", err.Error())
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{"path": targetPath})
	}
}

type writeFileRequest struct {
	Path     string `json:"path" validate:"required,max=2048"`
	Filename string `json:"filename" validate:"omitempty,max=255"`
	Title    string `json:"title" validate:"omitempty,max=255"`
	Content  string `json:"content" validate:"required,max=50000000"`
	Encoding string `json:"encoding" validate:"omitempty,oneof=utf8 base64"`
}

// writeFileHandler overwrites file content.
// @Summary Write file
// @Tags Filesystem
// @Description Overwrite file content at absolute path using utf8 or base64 payload
// @Accept json
// @Produce json
// @Param request body writeFileRequest true "Write file payload (if path is folder, filename/title is used)"
// @Success 200 {object} map[string]any
// @Failure 400 {object} response.ErrorBody
// @Router /api/v1/files/write [put]
func writeFileHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req writeFileRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}
		basePath, err := normalizeAbsolutePath(req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		targetPath := resolveFileTarget(basePath, req.Filename, req.Title)
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "mkdir_failed", err.Error())
		}
		data := []byte(req.Content)
		if req.Encoding == "base64" {
			decoded, err := base64.StdEncoding.DecodeString(req.Content)
			if err != nil {
				return response.BadRequest(c, "invalid base64 content")
			}
			data = decoded
		}
		if err := os.WriteFile(targetPath, data, 0o644); err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "write_failed", err.Error())
		}
		return response.OK(c, fiber.Map{"path": targetPath, "bytes": len(data)})
	}
}

func normalizeAbsolutePath(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if p == "" {
		return "", fiber.NewError(fiber.StatusBadRequest, "path is required")
	}
	if strings.ContainsAny(p, "\n\r\t") {
		return "", fiber.NewError(fiber.StatusBadRequest, "path contains invalid control characters; use escaped backslashes (\\\\) or forward slashes (/)")
	}
	if runtime.GOOS == "windows" {
		p = strings.ReplaceAll(p, "/", `\`)
	} else {
		p = strings.ReplaceAll(p, `\`, "/")
	}
	return filepath.Clean(p), nil
}

func resolveFileTarget(path, filename, title string) string {
	name := strings.TrimSpace(filename)
	if name == "" {
		name = strings.TrimSpace(title)
	}
	if strings.HasSuffix(path, "/") || strings.HasSuffix(path, `\`) {
		if name == "" {
			name = "untitled.txt"
		}
		return filepath.Join(path, name)
	}
	if st, err := os.Stat(path); err == nil && st.IsDir() {
		if name == "" {
			name = "untitled.txt"
		}
		return filepath.Join(path, name)
	}
	if name != "" {
		return filepath.Join(path, name)
	}
	return path
}

func zipDirectory(dir string) (string, error) {
	tmp, err := os.CreateTemp("", "skyport-dir-*.zip")
	if err != nil {
		return "", err
	}
	defer tmp.Close()

	zw := zip.NewWriter(tmp)
	defer zw.Close()

	base := filepath.Clean(dir)
	err = filepath.Walk(base, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(base, path)
		if err != nil {
			return err
		}
		w, err := zw.Create(filepath.ToSlash(rel))
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
	if err != nil {
		return "", err
	}
	return tmp.Name(), nil
}

func libreOfficeUserInstallationURI(dir string) string {
	abs := filepath.Clean(dir)
	if resolved, err := filepath.Abs(abs); err == nil {
		abs = resolved
	}

	path := filepath.ToSlash(abs)
	if runtime.GOOS == "windows" {
		// Windows drive paths must be represented as /C:/... in file URIs.
		if len(path) >= 2 && path[1] == ':' {
			path = "/" + path
		}
	}

	return (&url.URL{Scheme: "file", Path: path}).String()
}

type convertRequest struct {
	Path   string `json:"path" validate:"required,max=2048"`
	To     string `json:"to" validate:"required,oneof=html pdf png docx pptx"`
	SaveAs string `json:"save_as" validate:"omitempty,max=255"`
}

// convertHandler converts documents using LibreOffice (soffice) in headless mode.
// Supported conversions: docx -> html|pdf, pptx -> png|html|pdf, html -> docx
func convertHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var req convertRequest
		if err := validator.ParseAndValidate(c, &req); err != nil {
			return err
		}

		srcPath, err := normalizeAbsolutePath(req.Path)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}
		// Ensure source exists
		if _, err := os.Stat(srcPath); err != nil {
			return response.Error(c, fiber.StatusNotFound, "file_not_found", "file does not exist")
		}

		// Prepare output dir
		outDir, err := os.MkdirTemp("", "skyport-conv-*")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "tempdir_failed", err.Error())
		}
		defer os.RemoveAll(outDir)

		// Map requested target format to soffice convert-to argument
		target := req.To
		// Use LibreOffice soffice for conversion when available
		soffice, lookErr := exec.LookPath("soffice")
		if lookErr != nil {
			if runtime.GOOS == "windows" {
				commonPaths := []string{
					`C:\Program Files\LibreOffice\program\soffice.exe`,
					`C:\Program Files (x86)\LibreOffice\program\soffice.exe`,
				}
				for _, p := range commonPaths {
					if _, err := os.Stat(p); err == nil {
						soffice = p
						lookErr = nil
						break
					}
				}
			}
		}
		if lookErr != nil {
			return response.Error(c, fiber.StatusInternalServerError, "soffice_missing", "LibreOffice (soffice) not installed on server")
		}

		// Build command
		// Use per-request profile to avoid lock-contention failures when multiple converts run together.
		loProfileDir, err := os.MkdirTemp("", "skyport-lo-profile-*")
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "temp_profile_failed", err.Error())
		}
		defer os.RemoveAll(loProfileDir)

		convertArg := target
		if target == "html" {
			ext := strings.ToLower(filepath.Ext(srcPath))
			switch ext {
			case ".docx", ".doc":
				convertArg = "html:XHTML Writer File:UTF8"
			case ".pptx", ".ppt":
				convertArg = "html:impress_html_Export"
			default:
				convertArg = "html"
			}
		}

		args := []string{
			"--headless",
			"--invisible",
			"--nologo",
			"--nodefault",
			"--nofirststartwizard",
			"--norestore",
			"--nolockcheck",
			"-env:UserInstallation=" + libreOfficeUserInstallationURI(loProfileDir),
			"--convert-to", convertArg,
			"--outdir", outDir,
			srcPath,
		}

		ctx, cancel := context.WithTimeout(c.Context(), 45*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, soffice, args...)
		// run
		output, err := cmd.CombinedOutput()
		if ctx.Err() == context.DeadlineExceeded {
			return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "convert_timeout", "conversion timed out", fiber.Map{"timeout_ms": 45000, "output": string(output)})
		}
		if err != nil {
			return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "convert_failed", "conversion command failed", fiber.Map{"output": string(output), "error": err.Error()})
		}

		// Locate converted files in outDir
		files, err := os.ReadDir(outDir)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "read_outdir_failed", err.Error())
		}
		if len(files) == 0 {
			return response.ErrorWithDetails(c, fiber.StatusInternalServerError, "convert_no_output", "no output files produced", fiber.Map{"output": string(output)})
		}

		// If SaveAs provided, write the first converted file back to original folder
		if strings.TrimSpace(req.SaveAs) != "" {
			// Use the first file as the saved artifact
			first := files[0]
			outPath := filepath.Join(outDir, first.Name())
			outBytes, err := os.ReadFile(outPath)
			if err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "read_output_failed", err.Error())
			}
			saveName := req.SaveAs
			// Resolve destination in same directory as source
			dest := filepath.Join(filepath.Dir(srcPath), saveName)
			if err := os.WriteFile(dest, outBytes, 0o644); err != nil {
				return response.Error(c, fiber.StatusInternalServerError, "save_failed", err.Error())
			}
			return response.OK(c, fiber.Map{"path": dest})
		}

		// Prepare previews for frontend: if multiple files (e.g., pptx->png), return array
		previews := make([]fiber.Map, 0, len(files))
		for _, f := range files {
			outPath := filepath.Join(outDir, f.Name())
			outBytes, err := os.ReadFile(outPath)
			if err != nil {
				continue
			}
			encoded := base64.StdEncoding.EncodeToString(outBytes)
			ext := filepath.Ext(f.Name())
			contentType := mime.TypeByExtension(ext)
			if contentType == "" {
				contentType = http.DetectContentType(outBytes)
			}
			previews = append(previews, fiber.Map{"preview": encoded, "content_type": contentType, "filename": f.Name()})
		}

		if len(previews) == 1 {
			return response.OK(c, previews[0])
		}
		return response.OK(c, fiber.Map{"items": previews})
	}
}
