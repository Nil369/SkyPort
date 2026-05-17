package docker

import "context"

type ProxyManager struct{}

func NewProxyManager() *ProxyManager { return &ProxyManager{} }

// SwitchTraffic updates reverse proxy target to new backend (stub).
func (p *ProxyManager) SwitchTraffic(ctx context.Context, projectID uint, target string) error {
	// TODO: implement Caddy config generation and reload
	return nil
}
