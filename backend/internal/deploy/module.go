package deploy

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "deploy" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}

type Strategy string

const (
	StrategyGit       Strategy = "git"
	StrategyContainer Strategy = "container"
)

type Request struct {
	ProjectID uint
	Strategy  Strategy
	Ref       string
}

type Result struct {
	DeploymentID string
	Status       string
	Message      string
}

// Deployer defines future CI/CD entrypoints without forcing implementation now.
type Deployer interface {
	Deploy(req Request) (*Result, error)
}
