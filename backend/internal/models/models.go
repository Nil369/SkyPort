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
		&Role{},
		&Permission{},
		&RolePermission{},
		&UserRole{},
		&UserActivityLog{},
		&LoginHistory{},
		&InviteToken{},
		&ClusterServer{},
		&AgentRecord{},
		&AgentToken{},
		&MarketplaceInstall{},
		&Project{},
		&Deployment{},
		&Runtime{},
		&Process{},
		&EnvironmentVariable{},
		&DomainMapping{},
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
	GitAuthType    string `gorm:"size:16"`
	GitPAT         string `gorm:"size:4096"`
	GitSSHKey      string `gorm:"size:4096"`

	Enabled              bool   `gorm:"not null;default:true"`
	AvatarRelativePath   string `gorm:"size:512"` // relative to workspace root, e.g. users/12/avatar.png
	PasswordResetToken   string `gorm:"size:128"`
	PasswordResetExpires *time.Time
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
	Private   bool           `gorm:"not null;default:false" json:"private"`
}

// Deployment tracks one deployment lifecycle for a project.
type Deployment struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`

	ProjectID uint   `gorm:"index;not null"`
	Path      string `gorm:"size:1024;not null"`
	Runtime   string `gorm:"size:50;not null"`
	Strategy  string `gorm:"size:50;not null"`
	Status    string `gorm:"size:30;index;not null"`
	Port      int    `gorm:"default:0"`
	LogPath   string `gorm:"size:1024;not null"`
	Error     string `gorm:"size:2048"`
}

// Runtime stores runtime installation metadata.
type Runtime struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`

	Name      string `gorm:"size:50;index;not null"`
	Version   string `gorm:"size:120"`
	Path      string `gorm:"size:1024"`
	Installed bool   `gorm:"not null;default:false"`
}

// Process tracks the process started for a deployment.
type Process struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`

	DeploymentID uint   `gorm:"index;not null"`
	PID          int    `gorm:"index"`
	Manager      string `gorm:"size:30;not null"` // pm2 | systemd | direct
	Command      string `gorm:"size:2048;not null"`
	Status       string `gorm:"size:30;index;not null"`
}

// EnvironmentVariable stores deployment env vars.
type EnvironmentVariable struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`

	DeploymentID uint   `gorm:"index;not null"`
	Key          string `gorm:"size:255;index;not null"`
	Value        string `gorm:"size:4096;not null"`
	Masked       bool   `gorm:"not null;default:false"`
}

// DomainMapping stores reverse proxy mappings (domain -> local port).
type DomainMapping struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index" swaggertype:"string"`

	Domain    string `gorm:"size:255;index;not null" json:"domain"`
	Port      int    `gorm:"not null" json:"port"`
	Type      string `gorm:"size:16;not null" json:"type"` // caddy | nginx
	EnableSSL bool   `gorm:"not null;default:false" json:"enable_ssl"`
	Email     string `gorm:"size:255" json:"email,omitempty"`
	ProjectID *uint  `gorm:"index" json:"project_id"`
}
