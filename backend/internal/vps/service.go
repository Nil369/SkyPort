package vps

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"
)

// Service handles VPS business logic
type Service struct {
	db         *gorm.DB
	encryptor  *Encryptor
	sshManager *SessionManager
}

// NewService creates a new VPS service
func NewService(db *gorm.DB, encryptionKey string) (*Service, error) {
	encryptor, err := NewEncryptor(encryptionKey)
	if err != nil {
		return nil, err
	}

	return &Service{
		db:         db,
		encryptor:  encryptor,
		sshManager: NewSessionManager(),
	}, nil
}

// CreateVPS creates a new VPS server entry
func (s *Service) CreateVPS(req *CreateVPSRequest) (*VPSServerResponse, error) {
	// Validate request
	if err := validateCreateVPSRequest(req); err != nil {
		return nil, err
	}

	// Check for duplicate server
	var existingVPS VPSServer
	if err := s.db.Where("ip_address = ? AND ssh_username = ? AND ssh_port = ?",
		req.IPAddress, req.SSHUsername, req.SSHPort).First(&existingVPS).Error; err == nil {
		return nil, errors.New("VPS server with same IP, username, and port already exists")
	}

	// Parse tags
	tagsJSON, _ := json.Marshal(req.Tags)

	vps := VPSServer{
		ID:          uuid.New().String(),
		ServerName:  strings.TrimSpace(req.ServerName),
		IPAddress:   strings.TrimSpace(req.IPAddress),
		SSHUsername: strings.TrimSpace(req.SSHUsername),
		SSHPort:     req.SSHPort,
		AuthType:    strings.ToLower(req.AuthType),
		KeyFilename: req.SSHKeyFilename,
		Tags:        tagsJSON,
		Notes:       req.Notes,
		IsActive:    true,
		Status:      "offline",
	}

	// Handle SSH key or password
	if req.AuthType == "key" {
		keyContent := []byte(req.SSHKeyContent)

		// Validate key format
		if err := ValidateKeyFormat(keyContent); err != nil {
			return nil, fmt.Errorf("invalid SSH key format: %w", err)
		}

		// Generate fingerprint
		fingerprint, err := HashSSHKey(keyContent)
		if err != nil {
			return nil, fmt.Errorf("failed to generate key fingerprint: %w", err)
		}
		vps.KeyFingerprint = fingerprint

		// Encrypt and store key
		encryptedKey, err := s.encryptor.Encrypt(keyContent)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt SSH key: %w", err)
		}
		vps.EncryptedSSHKey = []byte(encryptedKey)

		// Secure wipe original
		SecureWipe(keyContent)

	} else if req.AuthType == "password" {
		if req.Password == "" {
			return nil, errors.New("password required for password authentication")
		}

		// Encrypt and store password
		encryptedPass, err := s.encryptor.Encrypt([]byte(req.Password))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt password: %w", err)
		}
		vps.EncryptedPassword = []byte(encryptedPass)

		// Secure wipe original
		SecureWipe([]byte(req.Password))
	}

	// Save to database
	if err := s.db.Create(&vps).Error; err != nil {
		return nil, fmt.Errorf("failed to create VPS: %w", err)
	}

	return toVPSResponse(&vps), nil
}

// UpdateVPS updates an existing VPS server
func (s *Service) UpdateVPS(vpsID string, req *UpdateVPSRequest) (*VPSServerResponse, error) {
	vps := &VPSServer{}
	if err := s.db.First(vps, "id = ?", vpsID).Error; err != nil {
		return nil, fmt.Errorf("VPS not found: %w", err)
	}

	// Update fields
	if req.ServerName != "" {
		vps.ServerName = strings.TrimSpace(req.ServerName)
	}
	if req.SSHUsername != "" {
		vps.SSHUsername = strings.TrimSpace(req.SSHUsername)
	}
	if req.SSHPort > 0 {
		vps.SSHPort = req.SSHPort
	}
	if req.Tags != nil {
		tagsJSON, _ := json.Marshal(req.Tags)
		vps.Tags = tagsJSON
	}
	if req.Notes != "" {
		vps.Notes = req.Notes
	}

	// Update auth if provided
	if req.AuthType != "" {
		vps.AuthType = strings.ToLower(req.AuthType)

		if req.AuthType == "key" && req.SSHKeyContent != "" {
			keyContent := []byte(req.SSHKeyContent)

			if err := ValidateKeyFormat(keyContent); err != nil {
				return nil, fmt.Errorf("invalid SSH key format: %w", err)
			}

			fingerprint, err := HashSSHKey(keyContent)
			if err != nil {
				return nil, fmt.Errorf("failed to generate key fingerprint: %w", err)
			}
			vps.KeyFingerprint = fingerprint

			encryptedKey, err := s.encryptor.Encrypt(keyContent)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt SSH key: %w", err)
			}
			vps.EncryptedSSHKey = []byte(encryptedKey)
			SecureWipe(keyContent)

		} else if req.AuthType == "password" && req.Password != "" {
			encryptedPass, err := s.encryptor.Encrypt([]byte(req.Password))
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt password: %w", err)
			}
			vps.EncryptedPassword = []byte(encryptedPass)
			SecureWipe([]byte(req.Password))
		}
	}

	if err := s.db.Save(vps).Error; err != nil {
		return nil, fmt.Errorf("failed to update VPS: %w", err)
	}

	return toVPSResponse(vps), nil
}

// DeleteVPS soft-deletes a VPS server
func (s *Service) DeleteVPS(vpsID string) error {
	// Close any active sessions
	s.sshManager.CloseAllForVPS(vpsID)

	if err := s.db.Delete(&VPSServer{}, "id = ?", vpsID).Error; err != nil {
		return fmt.Errorf("failed to delete VPS: %w", err)
	}

	return nil
}

// GetVPS retrieves a VPS server by ID
func (s *Service) GetVPS(vpsID string) (*VPSServerResponse, error) {
	vps := &VPSServer{}
	if err := s.db.First(vps, "id = ?", vpsID).Error; err != nil {
		return nil, fmt.Errorf("VPS not found: %w", err)
	}

	return toVPSResponse(vps), nil
}

// ListVPS retrieves all active VPS servers
func (s *Service) ListVPS(offset, limit int) ([]VPSServerResponse, int64, error) {
	var vpsList []VPSServer
	var total int64

	if err := s.db.Model(&VPSServer{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count VPS: %w", err)
	}

	if err := s.db.Offset(offset).Limit(limit).Order("created_at DESC").
		Find(&vpsList).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list VPS: %w", err)
	}

	responses := make([]VPSServerResponse, len(vpsList))
	for i, vps := range vpsList {
		responses[i] = *toVPSResponse(&vps)
	}

	return responses, total, nil
}

// TestSSHConnection tests connectivity to a VPS server
func (s *Service) TestSSHConnection(vpsID string) (*TestResult, error) {
	vps := &VPSServer{}
	if err := s.db.First(vps, "id = ?", vpsID).Error; err != nil {
		return &TestResult{
			Success: false,
			Message: "VPS not found",
		}, nil
	}

	startTime := time.Now()

	// Prepare auth
	var auth ssh.AuthMethod
	var err error

	if vps.AuthType == "key" {
		keyContent, err := s.encryptor.Decrypt(string(vps.EncryptedSSHKey))
		if err != nil {
			return &TestResult{
				Success:  false,
				Message:  fmt.Sprintf("Failed to decrypt SSH key: %v", err),
				TestTime: time.Now(),
				Duration: time.Since(startTime).Milliseconds(),
			}, nil
		}
		auth, err = NewPublicKeyAuthMethod(keyContent)
		SecureWipe(keyContent)
	} else {
		password, err := s.encryptor.Decrypt(string(vps.EncryptedPassword))
		if err != nil {
			return &TestResult{
				Success:  false,
				Message:  fmt.Sprintf("Failed to decrypt password: %v", err),
				TestTime: time.Now(),
				Duration: time.Since(startTime).Milliseconds(),
			}, nil
		}
		auth = NewPasswordAuthMethod(string(password))
		SecureWipe(password)
	}

	if err != nil {
		return &TestResult{
			Success:  false,
			Message:  fmt.Sprintf("Failed to prepare authentication: %v", err),
			TestTime: time.Now(),
			Duration: time.Since(startTime).Milliseconds(),
		}, nil
	}

	// Test connection
	success, message, err := TestConnection(vps.IPAddress, vps.SSHPort, vps.SSHUsername, auth)

	result := &TestResult{
		Success:  success,
		Message:  message,
		TestTime: time.Now(),
		Duration: time.Since(startTime).Milliseconds(),
	}

	// Update status in database
	if success {
		s.db.Model(vps).Updates(map[string]interface{}{
			"status":            "online",
			"status_check_time": time.Now(),
		})
	} else {
		s.db.Model(vps).Updates(map[string]interface{}{
			"status":            "offline",
			"status_check_time": time.Now(),
		})
	}

	return result, nil
}

// Decrypt decrypts a string using the service's encryptor
func (s *Service) Decrypt(data string) ([]byte, error) {
	return s.encryptor.Decrypt(data)
}

// GetSessionManager returns the SSH session manager
func (s *Service) GetSessionManager() *SessionManager {
	return s.sshManager
}

// Helper functions

func toVPSResponse(vps *VPSServer) *VPSServerResponse {
	var tags []string
	if len(vps.Tags) > 0 {
		json.Unmarshal(vps.Tags, &tags)
	}

	return &VPSServerResponse{
		ID:                 vps.ID,
		ServerName:         vps.ServerName,
		IPAddress:          vps.IPAddress,
		SSHUsername:        vps.SSHUsername,
		SSHPort:            vps.SSHPort,
		AuthType:           vps.AuthType,
		KeyFingerprint:     vps.KeyFingerprint,
		KeyFilename:        vps.KeyFilename,
		Tags:               tags,
		Notes:              vps.Notes,
		IsActive:           vps.IsActive,
		LastConnectionTime: vps.LastConnectionTime,
		LastConnectionUser: vps.LastConnectionUser,
		ConnectionCount:    vps.ConnectionCount,
		Status:             vps.Status,
		StatusCheckTime:    vps.StatusCheckTime,
		CreatedAt:          vps.CreatedAt,
		UpdatedAt:          vps.UpdatedAt,
	}
}

func validateCreateVPSRequest(req *CreateVPSRequest) error {
	if req == nil {
		return errors.New("request cannot be nil")
	}

	if strings.TrimSpace(req.ServerName) == "" {
		return errors.New("server name is required")
	}

	if strings.TrimSpace(req.IPAddress) == "" {
		return errors.New("IP address is required")
	}

	if strings.TrimSpace(req.SSHUsername) == "" {
		return errors.New("SSH username is required")
	}

	if req.SSHPort < 1 || req.SSHPort > 65535 {
		return errors.New("invalid SSH port")
	}

	if req.AuthType != "key" && req.AuthType != "password" {
		return errors.New("auth type must be 'key' or 'password'")
	}

	if req.AuthType == "key" && strings.TrimSpace(req.SSHKeyContent) == "" {
		return errors.New("SSH key content is required for key authentication")
	}

	if req.AuthType == "password" && strings.TrimSpace(req.Password) == "" {
		return errors.New("password is required for password authentication")
	}

	return nil
}
