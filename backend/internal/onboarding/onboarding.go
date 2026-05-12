// Package onboarding holds first-run and guided-setup helpers for the control plane UI.
// HTTP routes are served by the embedded frontend; this package is reserved for future
// server-side checks (license, migrations, feature flags) without coupling bootstrap.
package onboarding

import "gorm.io/gorm"

// NeedsFirstUser reports whether the database has zero accounts (setup wizard).
func NeedsFirstUser(db *gorm.DB) (bool, error) {
	if db == nil {
		return false, nil
	}
	var n int64
	if err := db.Raw(`SELECT count(*) FROM users WHERE deleted_at IS NULL`).Scan(&n).Error; err != nil {
		return false, err
	}
	return n == 0, nil
}
