package frontend

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"

	"skyport/internal/app"
)

// Mount registers the embedded UI as the last HTTP layer: static files from dist
// with SPA fallback to index.html. API, WebSocket, and Swagger paths are skipped
// so they keep matching earlier routes.
func Mount(a *app.App) {
	sub, err := fs.Sub(Dist, "dist")
	if err != nil {
		panic("frontend: fs.Sub(dist): " + err.Error())
	}

	a.Fiber.Use(filesystem.New(filesystem.Config{
		Root:         http.FS(sub),
		Next:         skipBackendPrefixes,
		NotFoundFile: "/index.html",
		MaxAge:       3600,
	}))
}

func skipBackendPrefixes(c *fiber.Ctx) bool {
	p := c.Path()
	switch {
	case strings.HasPrefix(p, "/api"):
		return true
	case strings.HasPrefix(p, "/ws"):
		return true
	case strings.HasPrefix(p, "/docs"):
		return true
	default:
		return false
	}
}
