package models

import (
	"time"

	"gorm.io/gorm"
)

// Role is a named RBAC role (owner, admin, developer, viewer).
type Role struct {
	ID          uint `gorm:"primaryKey"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Name        string `gorm:"size:32;uniqueIndex;not null"` // owner | admin | developer | viewer
	DisplayName string `gorm:"size:120"`
}

// Permission is a fine-grained capability tracked in JWT middleware and WS guards.
type Permission struct {
	ID          uint `gorm:"primaryKey"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Key         string `gorm:"size:80;uniqueIndex;not null"` // e.g. deployments.create
	Description string `gorm:"size:255"`
}

// RolePermission maps roles to permissions (composite key).
type RolePermission struct {
	RoleID       uint `gorm:"primaryKey"`
	PermissionID uint `gorm:"primaryKey"`
}

// UserRole assigns roles to users (composite key).
type UserRole struct {
	UserID uint `gorm:"primaryKey"`
	RoleID uint `gorm:"primaryKey"`
}

// UserActivityLog records auditable actions (append-only).
type UserActivityLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UserID    uint      `gorm:"index;not null" json:"user_id"` // subject user (who was affected)
	ActorID   *uint     `gorm:"index" json:"actor_id,omitempty"`
	Action    string    `gorm:"size:64;index;not null" json:"action"`
	Target    string    `gorm:"size:255" json:"target,omitempty"`
	Detail    string    `gorm:"size:4096" json:"detail,omitempty"`
	IP        string    `gorm:"size:64" json:"ip,omitempty"`
}

// LoginHistory stores authentication attempts for security review.
type LoginHistory struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UserID    uint      `gorm:"index" json:"user_id"`
	Success   bool      `gorm:"not null;index" json:"success"`
	IP        string    `gorm:"size:64" json:"ip,omitempty"`
	UserAgent string    `gorm:"size:512" json:"user_agent,omitempty"`
}

// InviteToken allows pending user onboarding (optional flow).
type InviteToken struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`

	Token     string `gorm:"size:128;uniqueIndex;not null"`
	Email     string `gorm:"size:255;index;not null"`
	RoleID    uint   `gorm:"not null"`
	ExpiresAt time.Time
	UsedAt    *time.Time
}

// ClusterServer is a registered remote node for future multi-server orchestration.
type ClusterServer struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Name        string     `gorm:"size:120;not null" json:"name"`
	Address     string     `gorm:"size:512" json:"address,omitempty"`
	Fingerprint string     `gorm:"size:128" json:"fingerprint,omitempty"`
	LastSeenAt  *time.Time `json:"last_seen_at,omitempty"`
	Status      string     `gorm:"size:32;index" json:"status"` // online | offline | unknown
}

// AgentRecord tracks SkyPort agent registrations.
type AgentRecord struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	ServerID uint   `gorm:"index" json:"server_id"`
	Name     string `gorm:"size:120" json:"name"`
	Version  string `gorm:"size:64" json:"version"`
}

// AgentToken stores hashed credentials presented by remote agents.
type AgentToken struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`

	Name      string `gorm:"size:120;not null"`
	TokenHash string `gorm:"size:255;not null"`
	LastUsed  *time.Time
}

// MarketplaceInstall records installed marketplace apps (metadata only).
type MarketplaceInstall struct {
	ID        uint `gorm:"primaryKey"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`

	AppSlug     string `gorm:"size:120;index;not null"`
	InstallMode string `gorm:"size:32;not null"` // native | docker
	Status      string `gorm:"size:32;index;not null"`
	ManifestRef string `gorm:"size:512"`
	Notes       string `gorm:"size:2048"`
}
