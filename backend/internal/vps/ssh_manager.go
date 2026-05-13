package vps

import (
	"fmt"
	"io"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// SessionManager manages active SSH sessions
type SessionManager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

// Session represents an active SSH session
type Session struct {
	ID           string
	VPSServerID  string
	Client       *ssh.Client
	Session      *ssh.Session
	StdoutPipe   io.Reader
	StderrPipe   io.Reader
	StdinPipe    io.WriteCloser
	CreatedAt    time.Time
	LastActivity time.Time
	mu           sync.Mutex
}

// NewSessionManager creates a new session manager
func NewSessionManager() *SessionManager {
	sm := &SessionManager{
		sessions: make(map[string]*Session),
	}

	// Start cleanup goroutine for idle sessions
	go sm.cleanupIdleSessions()

	return sm
}

// CreateSession establishes an SSH session
func (sm *SessionManager) CreateSession(
	sessionID string,
	vpsServerID string,
	host string,
	port int,
	username string,
	auth ssh.AuthMethod,
	termWidth int,
	termHeight int,
) (*Session, error) {
	// Connect to SSH server
	config := &ssh.ClientConfig{
		User: username,
		Auth: []ssh.AuthMethod{auth},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			// TODO: Implement proper host key verification
			// For now, accept any host key (not recommended for production)
			// In production, store and verify known hosts
			return nil
		},
		Timeout: 30 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("failed to dial SSH: %w", err)
	}

	// Create session
	sshSession, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	// Get pipes
	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get stdout: %w", err)
	}

	stderr, err := sshSession.StderrPipe()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get stderr: %w", err)
	}

	stdin, err := sshSession.StdinPipe()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to get stdin: %w", err)
	}

	// Set terminal modes
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // Enable echoing
		ssh.TTY_OP_ISPEED: 14400, // Input speed = 14.4kbaud
		ssh.TTY_OP_OSPEED: 14400, // Output speed = 14.4kbaud
	}

	if err := sshSession.RequestPty("xterm-256color", termHeight, termWidth, modes); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to request PTY: %w", err)
	}

	// Start shell
	if err := sshSession.Shell(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to start shell: %w", err)
	}

	session := &Session{
		ID:           sessionID,
		VPSServerID:  vpsServerID,
		Client:       client,
		Session:      sshSession,
		StdoutPipe:   stdout,
		StderrPipe:   stderr,
		StdinPipe:    stdin,
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
	}

	sm.mu.Lock()
	sm.sessions[sessionID] = session
	sm.mu.Unlock()

	return session, nil
}

// GetSession retrieves a session by ID
func (sm *SessionManager) GetSession(sessionID string) (*Session, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	session, exists := sm.sessions[sessionID]
	if !exists {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}

	return session, nil
}

// CloseSession closes and removes a session
func (sm *SessionManager) CloseSession(sessionID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, exists := sm.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	if session.Session != nil {
		session.Session.Close()
	}

	if session.Client != nil {
		session.Client.Close()
	}

	delete(sm.sessions, sessionID)
	return nil
}

// CloseAllForVPS closes all sessions for a specific VPS
func (sm *SessionManager) CloseAllForVPS(vpsID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for id, session := range sm.sessions {
		if session.VPSServerID == vpsID {
			if session.Session != nil {
				session.Session.Close()
			}
			if session.Client != nil {
				session.Client.Close()
			}
			delete(sm.sessions, id)
		}
	}
}

// ResizeTerminal resizes the terminal
func (s *Session) ResizeTerminal(width, height int) error {
	if s.Session == nil {
		return fmt.Errorf("session not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.Session.WindowChange(height, width)
}

// WriteInput writes input to the SSH session
func (s *Session) WriteInput(data []byte) error {
	if s.StdinPipe == nil {
		return fmt.Errorf("stdin pipe not available")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.StdinPipe.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write input: %w", err)
	}

	s.LastActivity = time.Now()
	return nil
}

// ReadOutput reads output from SSH session with timeout
func (s *Session) ReadOutput(timeout time.Duration) ([]byte, error) {
	if s.StdoutPipe == nil {
		return nil, fmt.Errorf("stdout pipe not available")
	}

	buf := make([]byte, 32768) // 32KB buffer

	// Set read deadline
	if rc, ok := s.StdoutPipe.(interface{ SetReadDeadline(time.Time) error }); ok {
		rc.SetReadDeadline(time.Now().Add(timeout))
	}

	n, err := s.StdoutPipe.Read(buf)
	if err != nil && err != io.EOF {
		return nil, err
	}

	s.LastActivity = time.Now()
	return buf[:n], nil
}

// cleanupIdleSessions removes sessions idle for more than 30 minutes
func (sm *SessionManager) cleanupIdleSessions() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		sm.mu.Lock()

		now := time.Now()
		maxIdleTime := 30 * time.Minute

		for sessionID, session := range sm.sessions {
			if now.Sub(session.LastActivity) > maxIdleTime {
				// Close idle session
				if session.Session != nil {
					session.Session.Close()
				}
				if session.Client != nil {
					session.Client.Close()
				}
				delete(sm.sessions, sessionID)
			}
		}

		sm.mu.Unlock()
	}
}

// GetActiveSessions returns count of active sessions
func (sm *SessionManager) GetActiveSessions() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.sessions)
}

// NewPublicKeyAuthMethod creates auth method from private key
func NewPublicKeyAuthMethod(privateKey []byte) (ssh.AuthMethod, error) {
	signer, err := ssh.ParsePrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	return ssh.PublicKeys(signer), nil
}

// NewPasswordAuthMethod creates auth method from password
func NewPasswordAuthMethod(password string) ssh.AuthMethod {
	return ssh.Password(password)
}

// TestConnection tests SSH connectivity without creating a persistent session
func TestConnection(
	host string,
	port int,
	username string,
	auth ssh.AuthMethod,
) (bool, string, error) {
	config := &ssh.ClientConfig{
		User: username,
		Auth: []ssh.AuthMethod{auth},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			return nil
		},
		Timeout: 10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return false, fmt.Sprintf("Connection failed: %v", err), nil
	}

	defer client.Close()

	// Try to run a simple command to verify access
	session, err := client.NewSession()
	if err != nil {
		return false, fmt.Sprintf("Session creation failed: %v", err), nil
	}
	defer session.Close()

	// Run a simple command
	output, err := session.Output("echo 'Connection successful'")
	if err != nil {
		return false, fmt.Sprintf("Command execution failed: %v", err), nil
	}

	return true, fmt.Sprintf("Connection successful: %s", string(output)), nil
}
