package github

import "time"

type InstallInfo struct {
	AppName          string         `json:"app_name"`
	AppSlug          string         `json:"app_slug"`
	AppInstallURL    string         `json:"app_install_url"`
	APIBaseURL       string         `json:"api_base_url"`
	WebBaseURL       string         `json:"web_base_url"`
	HasAppConfig     bool           `json:"has_app_config"`
	HasWebhookSecret bool           `json:"has_webhook_secret"`
	FallbackModes    []string       `json:"fallback_modes"`
	RecommendedMode  string         `json:"recommended_mode"`
	Installations    []Installation `json:"installations"`
}

type Installation struct {
	ID             uint       `json:"id"`
	InstallationID int64      `json:"installation_id"`
	AccountLogin   string     `json:"account_login"`
	AccountType    string     `json:"account_type"`
	Status         string     `json:"status"`
	LastSyncedAt   *time.Time `json:"last_synced_at,omitempty"`
}

type Repository struct {
	ID             uint       `json:"id"`
	RepositoryID   int64      `json:"repository_id"`
	InstallationID uint       `json:"installation_id"`
	FullName       string     `json:"full_name"`
	Name           string     `json:"name"`
	Owner          string     `json:"owner"`
	OwnerType      string     `json:"owner_type,omitempty"`
	Private        bool       `json:"private"`
	Fork           bool       `json:"fork"`
	DefaultBranch  string     `json:"default_branch"`
	SelectedBranch string     `json:"selected_branch,omitempty"`
	CloneURL       string     `json:"clone_url,omitempty"`
	SSHURL         string     `json:"ssh_url,omitempty"`
	HomepageURL    string     `json:"homepage_url,omitempty"`
	Description    string     `json:"description,omitempty"`
	Language       string     `json:"language,omitempty"`
	Runtime        string     `json:"runtime,omitempty"`
	Framework      string     `json:"framework,omitempty"`
	DeploymentMode string     `json:"deployment_mode,omitempty"`
	Selected       bool       `json:"selected"`
	LastSyncedAt   *time.Time `json:"last_synced_at,omitempty"`
}

type ImportRequest struct {
	ConnectionID     uint              `json:"connection_id"`
	InstallationID   int64             `json:"installation_id"`
	RepositoryID     int64             `json:"repository_id"`
	FullName         string            `json:"full_name" validate:"required,max=255"`
	Name             string            `json:"name" validate:"omitempty,max=255"`
	Owner            string            `json:"owner" validate:"omitempty,max=255"`
	CloneURL         string            `json:"clone_url" validate:"omitempty,max=1024"`
	SSHURL           string            `json:"ssh_url" validate:"omitempty,max=1024"`
	Branch           string            `json:"branch" validate:"omitempty,max=255"`
	DeploymentMode   string            `json:"deployment_mode" validate:"omitempty,oneof=docker native pm2"`
	ProjectName      string            `json:"project_name" validate:"omitempty,max=120"`
	AuthType         string            `json:"auth_type" validate:"omitempty,oneof=app pat ssh"`
	PAT              string            `json:"pat" validate:"omitempty,max=4096"`
	SSHPrivateKey    string            `json:"ssh_private_key" validate:"omitempty,max=8192"`
	Environment      map[string]string `json:"environment"`
	Selected         bool              `json:"selected"`
	Refresh          bool              `json:"refresh"`
	ImportAsProject  bool              `json:"import_as_project"`
	WorkingDirectory string            `json:"working_directory" validate:"omitempty,max=512"`
}

type ConnectRequest struct {
	AuthType       string `json:"auth_type" validate:"required,oneof=app pat ssh"`
	InstallationID int64  `json:"installation_id" validate:"omitempty,min=1"`
	AccountLogin   string `json:"account_login" validate:"omitempty,max=255"`
	AccountType    string `json:"account_type" validate:"omitempty,max=32"`
	PAT            string `json:"pat" validate:"omitempty,max=4096"`
	SSHPrivateKey  string `json:"ssh_private_key" validate:"omitempty,max=8192"`
}

type ConnectResponse struct {
	Connection    map[string]any `json:"connection"`
	Installation  map[string]any `json:"installation,omitempty"`
	Repositories  int            `json:"repositories"`
	Installations int            `json:"installations"`
}

type ImportResponse struct {
	Project              map[string]any `json:"project"`
	Repository           Repository     `json:"repository"`
	Runtime              map[string]any `json:"runtime"`
	DeploymentSuggestion map[string]any `json:"deployment_suggestion"`
	Connection           map[string]any `json:"connection"`
}
