package vps

import (
	"fmt"
	"skyport/internal/app"
)

// Module implements the app.Module interface for VPS management.
type Module struct {
	Service *Service
}

func (m *Module) Name() string {
	return "vps"
}

func (m *Module) Register(a *app.App) error {
	svc, err := NewService(a.DB, a.Config.EncryptionKey)
	if err != nil {
		return fmt.Errorf("vps service: %w", err)
	}
	m.Service = svc

	// Note: Routes are registered via the VPSHandler in internal/api
	// which is mounted in api.Mount(). This module primarily handles
	// the service lifecycle and dependency injection.
	return nil
}

// GetService retrieves the VPS service from the app container.
// It performs lazy initialization if the service is not yet started.
func GetService(a *app.App) *Service {
	for _, m := range a.Modules {
		if vm, ok := m.(*Module); ok {
			if vm.Service == nil {
				svc, err := NewService(a.DB, a.Config.EncryptionKey)
				if err != nil {
					return nil
				}
				vm.Service = svc
			}
			return vm.Service
		}
	}
	return nil
}
