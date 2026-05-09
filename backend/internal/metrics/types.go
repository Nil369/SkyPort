// Package metrics (types) defines versioned DTOs for host metrics.
//
// Scalability: HostSnapshot is the "host" slice of a future union model. Later:
//   - ContainerSnapshot / ProcessSnapshot embed or extend via dedicated blocks
//   - FleetSnapshot { Hosts []HostSnapshot } for multi-server aggregation
// Keep JSON field names stable; bump Schema when breaking.
package metrics

import "time"

// SchemaHostV1 identifies the host-only metrics contract for clients and caches.
const SchemaHostV1 = "skyport.metrics.host.v1"

// HostSnapshot is the reusable REST + WebSocket payload for machine metrics.
//
// Example JSON:
//
//	{
//	  "schema": "skyport.metrics.host.v1",
//	  "collected_at": "2026-05-10T12:00:00Z",
//	  "host": {
//	    "hostname": "skyport-1",
//	    "uptime_seconds": 86400
//	  },
//	  "cpu": {
//	    "usage_percent": 12.3,
//	    "cores_logical": 2
//	  },
//	  "memory": {
//	    "total_bytes": 536870912,
//	    "used_bytes": 402653184,
//	    "free_bytes": 134217728,
//	    "used_percent": 75.0
//	  },
//	  "disk": {
//	    "path": "/",
//	    "total_bytes": 21474836480,
//	    "used_bytes": 10737418240,
//	    "free_bytes": 10737418240,
//	    "used_percent": 50.0
//	  }
//	}
type HostSnapshot struct {
	Schema      string    `json:"schema"`
	CollectedAt time.Time `json:"collected_at"`
	Host        HostInfo  `json:"host"`
	CPU         CPUStats  `json:"cpu"`
	Memory      MemStats  `json:"memory"`
	Disk        DiskStats `json:"disk"`
	// Future: Containers []ContainerStats `json:"containers,omitempty"`
	// Future: Processes []ProcessStats   `json:"processes,omitempty"`
	// Future: NodeID   string           `json:"node_id,omitempty"` // multi-server
}

// HostInfo is static or slow-changing host metadata.
type HostInfo struct {
	Hostname      string `json:"hostname"`
	UptimeSeconds uint64 `json:"uptime_seconds"`
}

// CPUStats holds normalized CPU figures for dashboards.
type CPUStats struct {
	UsagePercent float64 `json:"usage_percent"`
	CoresLogical int     `json:"cores_logical"`
}

// MemStats mirrors OS virtual memory (RAM) usage.
type MemStats struct {
	TotalBytes  uint64  `json:"total_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedPercent float64 `json:"used_percent"`
}

// DiskStats describes a single mount (root or configured path).
type DiskStats struct {
	Path        string  `json:"path"`
	TotalBytes  uint64  `json:"total_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedPercent float64 `json:"used_percent"`
}
