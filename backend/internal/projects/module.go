// Package projects will own project CRUD, metadata, and linkage to git remotes.
package projects

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "projects" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}
