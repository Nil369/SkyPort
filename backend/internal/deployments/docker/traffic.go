package docker

import "context"

// traffic.go contains helpers for traffic switching and proxy integration.

// PrepareTrafficTarget returns the target address for a newly started container (stub).
func PrepareTrafficTarget(projectID uint, containerPort int) string {
	return "http://127.0.0.1:placeholder"
}

func EnsureProxyReload(ctx context.Context) error {
	// TODO: trigger Caddy reload or update config atomically
	return nil
}
