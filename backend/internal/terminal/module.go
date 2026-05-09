// Package terminal will host PTY/WebSocket terminal sessions. Register mounts routes on App.
package terminal

import "skyport/internal/app"

// Module is a no-op stub; implement Register when wiring shell sessions.
type Module struct{}

func (m *Module) Name() string { return "terminal" }

func (m *Module) Register(a *app.App) error {
	_ = a
	// Future: a.Fiber.Group("/api/v1/terminal", auth.RequireJWT(...))
	return nil
}
