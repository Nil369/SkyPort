package updates

import (
	"skyport/internal/app"
	"skyport/internal/version"
)

type Module struct {
	Checker *ReleaseChecker
}

func (m *Module) Name() string {
	return "updates"
}

func (m *Module) Register(a *app.App) error {
	m.Checker = NewReleaseChecker("Nil369", "SkyPort", version.Version)
	// Optionally clear cache on startup to ensure fresh check
	m.Checker.ClearCache()
	return nil
}

// GetChecker retrieves the update checker from the app container.
// It performs lazy initialization if the checker is not yet started.
func GetChecker(a *app.App) *ReleaseChecker {
	for _, m := range a.Modules {
		if um, ok := m.(*Module); ok {
			if um.Checker == nil {
				um.Checker = NewReleaseChecker("Nil369", "SkyPort", version.Version)
				um.Checker.ClearCache()
			}
			return um.Checker
		}
	}
	return nil
}
