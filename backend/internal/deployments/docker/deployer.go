package docker

import (
	"context"
	"fmt"
)

type Deployer struct{}

func NewDeployer() *Deployer { return &Deployer{} }

// DeployNewContainer starts a container from image and returns container id (stub).
func (d *Deployer) DeployNewContainer(ctx context.Context, projectID uint, image string, port int) (string, error) {
	// TODO: replace with github.com/docker/docker client based container creation
	return fmt.Sprintf("stub-container-%d", projectID), nil
}
