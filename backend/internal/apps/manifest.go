package apps

// Manifest describes a marketplace app template (loaded from JSON/YAML on disk in a future iteration).
type Manifest struct {
	Name               string            `json:"name"`
	Slug               string            `json:"slug"`
	Description        string            `json:"description"`
	Category           string            `json:"category"`
	Icon               string            `json:"icon"`
	ImageURL           string            `json:"image_url"`
	InstallModes       []string          `json:"install_modes"` // native | docker
	Ports              []int             `json:"ports"`
	Env                map[string]string `json:"env"`
	Healthcheck        string            `json:"healthcheck"`
	Runtime            string            `json:"runtime"`
	MemoryRequirements string            `json:"memory_requirements"`
	CPURequirements    string            `json:"cpu_requirements"`
	SupportedOS        []string          `json:"supported_os"`
	Tags               []string          `json:"tags"`
	Featured           bool              `json:"featured"`
	Trending           bool              `json:"trending"`
}
