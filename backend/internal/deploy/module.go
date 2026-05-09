// Package deploy will orchestrate rollouts (git pull, compose, health checks).
package deploy

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "deploy" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}
