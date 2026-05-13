package vps

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// VPSServer represents a VPS instance managed through SkyPort
type VPSServer struct {
	ID                 string         `gorm:"primaryKey" json:"id"`
	ServerName         string         `gorm:"index;not null" json:"server_name" validate:"required,max=255"`
	IPAddress          string         `gorm:"not null" json:"ip_address" validate:"required,ip"`
	SSHUsername        string         `gorm:"not null" json:"ssh_username" validate:"required,max=255"`
	SSHPort            int            `gorm:"default:22" json:"ssh_port" validate:"required,min=1,max=65535"`
	AuthType           string         `gorm:"type:varchar(20);default:'key'" json:"auth_type"` // 'key' or 'password'
	EncryptedSSHKey    []byte         `gorm:"type:BLOB" json:"-"`                              // Never expose to frontend
	EncryptedPassword  []byte         `gorm:"type:BLOB" json:"-"`                              // Never expose to frontend
	KeyFingerprint     string         `gorm:"index" json:"key_fingerprint"`                    // SHA256 fingerprint for display
	KeyFilename        string         `gorm:"max=255" json:"key_filename"`                     // Original filename
	Tags               datatypes.JSON `gorm:"type:JSON" json:"tags"`                           // ["prod", "backup"]
	Notes              string         `gorm:"type:TEXT" json:"notes"`
	IsActive           bool           `gorm:"default:true" json:"is_active"`
	LastConnectionTime *time.Time     `json:"last_connection_time"`
	LastConnectionUser string         `json:"last_connection_user"`
	ConnectionCount    int64          `gorm:"default:0" json:"connection_count"`
	Status             string         `gorm:"type:varchar(20);default:'offline'" json:"status"` // 'online', 'offline', 'unreachable'
	StatusCheckTime    *time.Time     `json:"status_check_time"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

// SSHSession represents an active or historical SSH session
type SSHSession struct {
	ID               string     `gorm:"primaryKey" json:"id"`
	VPSServerID      string     `gorm:"index;not null" json:"vps_server_id"`
	VPSServer        VPSServer  `gorm:"foreignKey:VPSServerID" json:"vps_server,omitempty"`
	UserID           string     `gorm:"index" json:"user_id"` // Admin user who initiated
	Username         string     `json:"username"`             // OS username of initiator
	SessionToken     string     `gorm:"index" json:"session_token"`
	TerminalWidth    int        `json:"terminal_width"`
	TerminalHeight   int        `json:"terminal_height"`
	IsActive         bool       `json:"is_active"`
	ConnectedAt      time.Time  `json:"connected_at"`
	DisconnectedAt   *time.Time `json:"disconnected_at"`
	Duration         int64      `json:"duration"` // Seconds
	CommandsExecuted int        `json:"commands_executed"`
	BytesSent        int64      `json:"bytes_sent"`
	BytesReceived    int64      `json:"bytes_received"`
	ErrorMessage     string     `json:"error_message"`
	ClientIP         string     `json:"client_ip"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// VPSServerResponse is the DTO for API responses (no encrypted fields)
type VPSServerResponse struct {
	ID                 string     `json:"id"`
	ServerName         string     `json:"server_name"`
	IPAddress          string     `json:"ip_address"`
	SSHUsername        string     `json:"ssh_username"`
	SSHPort            int        `json:"ssh_port"`
	AuthType           string     `json:"auth_type"`
	KeyFingerprint     string     `json:"key_fingerprint"`
	KeyFilename        string     `json:"key_filename"`
	Tags               []string   `json:"tags"`
	Notes              string     `json:"notes"`
	IsActive           bool       `json:"is_active"`
	LastConnectionTime *time.Time `json:"last_connection_time"`
	LastConnectionUser string     `json:"last_connection_user"`
	ConnectionCount    int64      `json:"connection_count"`
	Status             string     `json:"status"`
	StatusCheckTime    *time.Time `json:"status_check_time"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// CreateVPSRequest is the request DTO for creating a VPS
type CreateVPSRequest struct {
	ServerName     string   `json:"server_name" validate:"required,max=255"`
	IPAddress      string   `json:"ip_address" validate:"required,ip"`
	SSHUsername    string   `json:"ssh_username" validate:"required,max=255"`
	SSHPort        int      `json:"ssh_port" validate:"required,min=1,max=65535"`
	AuthType       string   `json:"auth_type" validate:"required,oneof=key password"`
	SSHKeyContent  string   `json:"ssh_key_content,omitempty" validate:"required_if=AuthType key"`
	SSHKeyFilename string   `json:"ssh_key_filename,omitempty"`
	Password       string   `json:"password,omitempty" validate:"required_if=AuthType password"`
	Tags           []string `json:"tags"`
	Notes          string   `json:"notes"`
}

// UpdateVPSRequest is the request DTO for updating a VPS
type UpdateVPSRequest struct {
	ServerName     string   `json:"server_name" validate:"max=255"`
	SSHUsername    string   `json:"ssh_username" validate:"max=255"`
	SSHPort        int      `json:"ssh_port" validate:"min=1,max=65535"`
	AuthType       string   `json:"auth_type" validate:"oneof=key password"`
	SSHKeyContent  string   `json:"ssh_key_content,omitempty"`
	SSHKeyFilename string   `json:"ssh_key_filename,omitempty"`
	Password       string   `json:"password,omitempty"`
	Tags           []string `json:"tags"`
	Notes          string   `json:"notes"`
	IsActive       bool     `json:"is_active"`
}

// SSHConnectRequest is the request for establishing SSH connection
type SSHConnectRequest struct {
	VPSServerID string `json:"vps_server_id" validate:"required"`
	TermWidth   int    `json:"term_width" validate:"required,min=80,max=1024"`
	TermHeight  int    `json:"term_height" validate:"required,min=24,max=1024"`
}

// SSHMessage is a WebSocket message for SSH session
type SSHMessage struct {
	Type      string `json:"type"` // 'input', 'resize', 'ping'
	Data      string `json:"data"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	SessionID string `json:"session_id,omitempty"`
}

// TestResult represents SSH connectivity test result
type TestResult struct {
	Success  bool      `json:"success"`
	Message  string    `json:"message"`
	TestTime time.Time `json:"test_time"`
	Duration int64     `json:"duration_ms"`
}
