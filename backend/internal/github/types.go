package github

import "time"

type InstallationRequest struct {
	InstallationID int64 `json:"installationId" validate:"required,min=1"`
}

type InstallationResponse struct {
	ID             uint      `json:"id"`
	InstallationID int64     `json:"installation_id"`
	CreatedAt      time.Time `json:"created_at"`
}

type RepositorySummary struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	FullName        string     `json:"full_name"`
	Private         bool       `json:"private"`
	Fork            bool       `json:"fork"`
	Archived        bool       `json:"archived"`
	Disabled        bool       `json:"disabled"`
	DefaultBranch   string     `json:"default_branch"`
	UpdatedAt       *time.Time `json:"updated_at,omitempty"`
	Owner           string     `json:"owner,omitempty"`
	OwnerAvatar     string     `json:"owner_avatar_url,omitempty"`
	CloneURL        string     `json:"clone_url,omitempty"`
	SSHURL          string     `json:"ssh_url,omitempty"`
	HomepageURL     string     `json:"homepage_url,omitempty"`
	Description     string     `json:"description,omitempty"`
	Language        string     `json:"language,omitempty"`
	License         string     `json:"license,omitempty"`
	StargazersCount int        `json:"stargazers_count,omitempty"`
	ForksCount      int        `json:"forks_count,omitempty"`
	OpenIssuesCount int        `json:"open_issues_count,omitempty"`
	Topics          []string   `json:"topics,omitempty"`
}

type RepositoryListResponse struct {
	Repositories []RepositorySummary `json:"repositories"`
}

type ImportGitHubProjectRequest struct {
	Repository string `json:"repository" validate:"required,max=255"`
	Branch     string `json:"branch" validate:"omitempty,max=255"`
}

type ImportGitHubProjectResponse struct {
	Project      map[string]any       `json:"project"`
	Repository   RepositorySummary    `json:"repository"`
	Framework    FrameworkDetection   `json:"framework"`
	Installation InstallationResponse `json:"installation"`
}

type BridgeInfo struct {
	BridgeURL     string `json:"bridge_url"`
	ConnectURL    string `json:"connect_url"`
	HasAppConfig  bool   `json:"has_app_config"`
	HasPrivateKey bool   `json:"has_private_key"`
	AppID         string `json:"app_id,omitempty"`
	GitHubBaseURL string `json:"github_base_url,omitempty"`
}

type HealthResponse struct {
	Status           string `json:"status"`
	HasAppConfig     bool   `json:"has_app_config"`
	HasPrivateKey    bool   `json:"has_private_key"`
	BridgeURL        string `json:"bridge_url"`
	GitHubAPIBaseURL string `json:"github_api_base_url"`
}

type FrameworkDetection struct {
	Framework string   `json:"framework"`
	Files     []string `json:"files"`
}
