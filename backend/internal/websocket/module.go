// Package websocket will use github.com/gorilla/websocket for bidirectional streams
// (terminal, build logs). Depend on Gorilla only when implementing handlers to keep
// cold builds minimal.
package websocket

import "skyport/internal/app"

type Module struct{}

func (m *Module) Name() string { return "websocket" }

func (m *Module) Register(a *app.App) error {
	_ = a
	return nil
}
