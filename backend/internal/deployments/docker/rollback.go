package docker

import "context"

type RollbackManager struct{}

func NewRollbackManager() *RollbackManager { return &RollbackManager{} }

// Rollback restores previous container/traffic target (stub).
func (r *RollbackManager) Rollback(ctx context.Context, projectID uint) error {
	// TODO: implement rollback logic using stored previous container id and proxy state
	return nil
}
