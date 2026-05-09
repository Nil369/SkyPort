// Package models defines GORM models and the migration registry.
//
// Architecture: AutoMigrate receives an explicit slice so adding a model is one line
// and avoids reflection-based scanning of the whole package (keeps startup predictable
// on small VPS instances).
package models

import (
	"time"

	"gorm.io/gorm"
)

// All returns every model that should exist in SQLite. Order can matter for FKs later.
func All() []any {
	return []any{
		&User{}, // placeholder for future JWT-backed accounts
	}
}

// User is a minimal placeholder for auth migrations. Replace or extend when JWT lands.
type User struct {
	ID        uint           `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
	Email     string         `gorm:"size:255;uniqueIndex;not null"`
}
