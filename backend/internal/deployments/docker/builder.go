package docker

import (
	"context"
)

// Builder handles image builds (stubbed implementation).
type Builder struct{}

func NewBuilder() *Builder { return &Builder{} }

// BuildImage starts a build and returns a logs channel and an error channel.
// This is a non-blocking stub; real implementation should stream docker build logs.
func (b *Builder) BuildImage(ctx context.Context, projectID uint, path, imageTag string) (<-chan string, <-chan error) {
	logs := make(chan string)
	errs := make(chan error, 1)
	go func() {
		defer close(logs)
		defer close(errs)
		logs <- "[builder] starting build (stub)"
		logs <- "[builder] finished build (stub)"
	}()
	return logs, errs
}
