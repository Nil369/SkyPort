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
		&User{},
		&Project{},
	}
}

// User stores account identity and hashed credential.
type User struct {
	ID             uint `gorm:"primaryKey"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      gorm.DeletedAt `gorm:"index" swaggertype:"string"`
	Email          string         `gorm:"size:255;uniqueIndex;not null"`
	Name           string         `gorm:"size:120;not null"`
	PasswordHash   string         `gorm:"size:255;not null"`
	ActiveToken    string         `gorm:"size:2048"`
	TokenExpiresAt *time.Time
}

// Project stores project metadata and managed path.
type Project struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`
	Name      string         `gorm:"size:120;not null"`
	Path      string         `gorm:"size:1024;not null;uniqueIndex"`
	GitURL    string         `gorm:"size:1024"`
}
