package runtime

type Kind string

const (
	Unknown Kind = "unknown"
	Node    Kind = "node"
	Bun     Kind = "bun"
	Python  Kind = "python"
	Go      Kind = "go"
	PHP     Kind = "php"
	Java    Kind = "java"
	Rust    Kind = "rust"
	Docker  Kind = "dockerfile"
	Compose Kind = "compose"
)

// Component describes one detected app root (e.g. client/ or server/ Node app).
type Component struct {
	WorkingDirectory string `json:"working_directory"`
	Kind             Kind   `json:"kind"`
	Evidence         string `json:"evidence"`
}

type DetectionResult struct {
	Runtime          Kind     `json:"runtime"`
	Confidence       string   `json:"confidence"`
	MatchedFiles     []string `json:"matched_files"`
	WorkingDirectory string   `json:"working_directory"`
	InstallCommand   string   `json:"install_command"`
	BuildCommand     string   `json:"build_command"`
	StartCommand     string   `json:"start_command"`
	Components       []Component `json:"components,omitempty"`
	Notes            string   `json:"notes,omitempty"`
	
	// Additional metadata for PM2/native deployments
	PackageManager   string   `json:"package_manager,omitempty"`   // npm, yarn, pnpm, bun, pip, etc
	Framework        string   `json:"framework,omitempty"`         // Next.js, NestJS, Express, FastAPI, etc
	DetectedPort     int      `json:"detected_port,omitempty"`     // From package.json or config
	SuggestedAppName string   `json:"suggested_app_name,omitempty"` // For PM2 --name
}

