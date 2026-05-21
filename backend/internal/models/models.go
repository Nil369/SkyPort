// Package models defines GORM models and the migration registry.
//
// Architecture: AutoMigrate receives an explicit slice so adding a model is one line
// and avoids reflection-based scanning of the whole package (keeps startup predictable
// on small VPS instances).
package models

import (
	"time"

	"skyport/internal/vps"

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
		&GitHubConnection{},
		&GitHubInstallation{},
		&GitHubRepository{},
		&Project{},
		&Deployment{},
		&Runtime{},
		&Process{},
		&EnvironmentVariable{},
		&DomainMapping{},
		&vps.VPSServer{},
		&vps.SSHSession{},
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

	// Extended fields for Docker rolling deployments
	CommitSHA           string     `gorm:"size:128;index"`
	Branch              string     `gorm:"size:128;index"`
	ImageTag            string     `gorm:"size:256"`
	ContainerID         string     `gorm:"size:128;index"`
	PreviousContainerID string     `gorm:"size:128;index"`
	HealthStatus        string     `gorm:"size:30;index"`
	ExposedPort         int        `gorm:"default:0"`
	PublicURL           string     `gorm:"size:1024"`
	RollbackAvailable   bool       `gorm:"not null;default:false"`
	StartedAt           *time.Time `gorm:"index"`
	FinishedAt          *time.Time `gorm:"index"`
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
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-" swaggertype:"string"`

	Domain    string `gorm:"size:255;index;not null" json:"domain"`
	Port      int    `gorm:"not null" json:"port"`
	Type      string `gorm:"size:16;not null" json:"type"` // caddy | nginx
	EnableSSL bool   `gorm:"not null;default:false" json:"enable_ssl"`
	Email       string         `gorm:"size:255" json:"email,omitempty"`
	ProjectID   *uint          `gorm:"index" json:"project_id"`
	Middlewares string         `gorm:"type:text" json:"middlewares"`
}

// GitHubConnection stores a SkyPort user's GitHub integration preferences and fallback credentials.
type GitHubConnection struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID          uint   `gorm:"index;not null" json:"user_id"`
	Provider        string `gorm:"size:32;index;not null" json:"provider"`
	AuthType        string `gorm:"size:16;index;not null" json:"auth_type"`
	InstallationID  int64  `gorm:"index" json:"installation_id"`
	AccountLogin    string `gorm:"size:255;index" json:"account_login,omitempty"`
	AccountType     string `gorm:"size:32" json:"account_type,omitempty"`
	AccessToken     string `gorm:"size:4096" json:"access_token,omitempty"`
	SSHPrivateKey   string `gorm:"size:8192" json:"ssh_private_key,omitempty"`
	RepositoryScope string `gorm:"size:1024" json:"repository_scope,omitempty"`
	Connected       bool   `gorm:"not null;default:false;index" json:"connected"`
}

// GitHubInstallation stores the active GitHub App installation ID for the instance.
type GitHubInstallation struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	InstallationID int64     `gorm:"uniqueIndex;not null" json:"installation_id"`
	CreatedAt      time.Time `json:"created_at"`
}

func (GitHubInstallation) TableName() string { return "github_installations" }

// GitHubRepository caches repository metadata and the branch selected for import.
type GitHubRepository struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	InstallationID uint       `gorm:"index;not null" json:"installation_id"`
	RepositoryID   int64      `gorm:"index" json:"repository_id"`
	FullName       string     `gorm:"size:255;index;not null" json:"full_name"`
	Name           string     `gorm:"size:255;index;not null" json:"name"`
	Owner          string     `gorm:"size:255;index;not null" json:"owner"`
	OwnerType      string     `gorm:"size:32" json:"owner_type,omitempty"`
	Private        bool       `gorm:"not null;default:false;index" json:"private"`
	Fork           bool       `gorm:"not null;default:false" json:"fork"`
	DefaultBranch  string     `gorm:"size:255;index" json:"default_branch"`
	SelectedBranch string     `gorm:"size:255;index" json:"selected_branch,omitempty"`
	CloneURL       string     `gorm:"size:1024" json:"clone_url,omitempty"`
	SSHURL         string     `gorm:"size:1024" json:"ssh_url,omitempty"`
	HomepageURL    string     `gorm:"size:1024" json:"homepage_url,omitempty"`
	Description    string     `gorm:"size:1024" json:"description,omitempty"`
	Language       string     `gorm:"size:120" json:"language,omitempty"`
	Runtime        string     `gorm:"size:64;index" json:"runtime,omitempty"`
	Framework      string     `gorm:"size:120;index" json:"framework,omitempty"`
	DeploymentMode string     `gorm:"size:32;index" json:"deployment_mode,omitempty"`
	Selected       bool       `gorm:"not null;default:false;index" json:"selected"`
	LastSyncedAt   *time.Time `json:"last_synced_at,omitempty"`
}
