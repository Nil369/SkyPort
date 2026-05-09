// Package docker will integrate container lifecycle (pull/run/stop) for deployments.
package docker

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "docker" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}
