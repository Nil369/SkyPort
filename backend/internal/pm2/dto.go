package pm2

// ProcessDTO is a stable, UI-friendly view of one PM2 process (from pm2 jlist).
type ProcessDTO struct {
	Name        string  `json:"name"`
	PMID        int     `json:"pm_id"`
	PID         int     `json:"pid"`
	Status      string  `json:"status"`
	CPU         float64 `json:"cpu"`
	MemoryBytes uint64  `json:"memory_bytes"`
	UptimeSec   int64   `json:"uptime_sec"`
	Restarts    int     `json:"restarts"`
	Unstable    int     `json:"unstable_restarts"`
	ExecMode    string  `json:"exec_mode"`
	Interpreter string  `json:"interpreter"`
	RuntimeType string  `json:"runtime_type"`
	Script      string   `json:"script"`
	Cwd         string   `json:"cwd"`
	EnvPort     int      `json:"env_port,omitempty"`
	Ports       []int    `json:"ports,omitempty"`
	Namespace   string   `json:"namespace,omitempty"`
	Framework   string   `json:"framework,omitempty"`
	GroupKey    string   `json:"group_key,omitempty"`
}

// EventDTO describes a detected change between snapshots (crash, restart, state).
type EventDTO struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	PrevStatus string `json:"prev_status,omitempty"`
	NextStatus string `json:"next_status,omitempty"`
	Message    string `json:"message,omitempty"`
}

// SnapshotPayload is sent over WebSocket and can be returned from internal refresh.
type SnapshotPayload struct {
	Type      string       `json:"type"`
	Reason    string       `json:"reason,omitempty"`
	Processes []ProcessDTO `json:"processes"`
	Events    []EventDTO   `json:"events,omitempty"`
	Signature string       `json:"signature,omitempty"`
	Collected int64        `json:"collected_at_ms"`
	PM2Binary string       `json:"pm2_binary,omitempty"`
}
