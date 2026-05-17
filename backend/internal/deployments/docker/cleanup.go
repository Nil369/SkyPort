package docker

import "context"

type CleanupManager struct{}

func NewCleanupManager() *CleanupManager { return &CleanupManager{} }

// Cleanup removes old containers and images according to retention policy (stub).
func (c *CleanupManager) Cleanup(ctx context.Context, projectID uint, keep int) error {
	// TODO: prune old containers/images while preserving the active one(s)
	return nil
}
