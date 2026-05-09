// Package filesystem will expose safe, sandboxed file APIs for project workspaces.
package filesystem

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "filesystem" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}
