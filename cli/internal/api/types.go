package api

import "time"

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type AuthResponse struct {
	User struct {
		ID    uint     `json:"id"`
		Name  string   `json:"name"`
		Email string   `json:"email"`
		Roles []string `json:"roles"`
	} `json:"user"`
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresAtUTC string `json:"expires_at_utc"`
}

type MeResponse struct {
	ID                 uint     `json:"id"`
	Name               string   `json:"name"`
	Email              string   `json:"email"`
	Enabled            bool     `json:"enabled"`
	AvatarRelativePath string   `json:"avatar_relative_path"`
	Roles              []string `json:"roles"`
	Permissions        []string `json:"permissions"`
}

type Project struct {
	ID        uint      `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	GitURL    string    `json:"git_url"`
	Private   bool      `json:"private"`
}

type Deployment struct {
	ID        uint      `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	ProjectID uint      `json:"project_id"`
	Path      string    `json:"path"`
	Runtime   string    `json:"runtime"`
	Strategy  string    `json:"strategy"`
	Status    string    `json:"status"`
	Port      int       `json:"port"`
	LogPath   string    `json:"log_path"`
	Error     string    `json:"error"`
}

type VPS struct {
	ID                 string     `json:"id"`
	ServerName         string     `json:"server_name"`
	IPAddress          string     `json:"ip_address"`
	SSHUsername        string     `json:"ssh_username"`
	SSHPort            int        `json:"ssh_port"`
	AuthType           string     `json:"auth_type"`
	KeyFingerprint     string     `json:"key_fingerprint"`
	KeyFilename        string     `json:"key_filename"`
	Notes              string     `json:"notes"`
	IsActive           bool       `json:"is_active"`
	LastConnectionTime *time.Time `json:"last_connection_time"`
	Status             string     `json:"status"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type MarketplaceApp struct {
	Name         string   `json:"name"`
	Slug         string   `json:"slug"`
	Category     string   `json:"category"`
	Description  string   `json:"description"`
	InstallModes []string `json:"install_modes"`
	Ports        []int    `json:"ports"`
	ImageURL     string   `json:"image_url"`
	Featured     bool     `json:"featured"`
	Trending     bool     `json:"trending"`
}

type HostSnapshot struct {
	Schema      string    `json:"schema"`
	CollectedAt time.Time `json:"collected_at"`
	Host        struct {
		Hostname      string `json:"hostname"`
		UptimeSeconds uint64 `json:"uptime_seconds"`
		UptimeHuman   string `json:"uptime_human"`
	} `json:"host"`
	CPU struct {
		UsagePercent float64 `json:"usage_percent"`
		CoresLogical int     `json:"cores_logical"`
	} `json:"cpu"`
	Memory struct {
		TotalHuman  string  `json:"total_human"`
		UsedHuman   string  `json:"used_human"`
		FreeHuman   string  `json:"free_human"`
		UsedPercent float64 `json:"used_percent"`
	} `json:"memory"`
	Disk struct {
		Path        string  `json:"path"`
		TotalHuman  string  `json:"total_human"`
		UsedHuman   string  `json:"used_human"`
		FreeHuman   string  `json:"free_human"`
		UsedPercent float64 `json:"used_percent"`
	} `json:"disk"`
}

type DockerContainer struct {
	ID      string `json:"id"`
	Names   string `json:"names"`
	Image   string `json:"image"`
	Status  string `json:"status"`
	Ports   string `json:"ports"`
	State   string `json:"state"`
	Created string `json:"created"`
	Context string `json:"context"`
}

type FileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

type FileListResponse struct {
	Path  string      `json:"path"`
	Items []FileEntry `json:"items"`
}

type FileContentResponse struct {
	Path        string `json:"path"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
	Encoding    string `json:"encoding"`
	Content     string `json:"content"`
	Preview     string `json:"preview"`
	Truncated   bool   `json:"truncated"`
	Message     string `json:"message"`
}

type SystemInfo struct {
	Hostname     string `json:"hostname"`
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
	GoVersion    string `json:"go_version"`
	CPUCores     int    `json:"cpu_cores"`
	DBPath       string `json:"db_path"`
}
