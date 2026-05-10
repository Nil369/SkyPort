package websocket

import (
	"sync"

	"skyport/internal/app"
)

type Module struct{}

func (m *Module) Name() string { return "websocket" }

func (m *Module) Register(a *app.App) error {
	_ = a
	ensureGlobalManager()
	return nil
}

var (
	globalManager *Manager
	once          sync.Once
)

func ensureGlobalManager() {
	once.Do(func() {
		globalManager = NewManager()
	})
}

func GlobalManager() *Manager {
	ensureGlobalManager()
	return globalManager
}
