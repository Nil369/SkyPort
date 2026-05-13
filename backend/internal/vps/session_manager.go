package vps

import (
	"sync"
	"time"
)

// SSHSessionManager manages lifecycle of SSH sessions
type SSHSessionManager struct {
	sessions     map[string]map[string]bool // vpsID -> sessionID
	sessionLock  sync.RWMutex
	creationTime map[string]time.Time
	timeLock     sync.RWMutex
}

// NewSSHSessionManager creates a new session manager
func NewSSHSessionManager() *SSHSessionManager {
	sm := &SSHSessionManager{
		sessions:     make(map[string]map[string]bool),
		creationTime: make(map[string]time.Time),
	}

	// Start cleanup routine
	go sm.cleanupExpiredSessions()

	return sm
}

// RegisterSession registers a session for tracking
func (sm *SSHSessionManager) RegisterSession(vpsID, sessionID string) {
	sm.sessionLock.Lock()
	defer sm.sessionLock.Unlock()

	if _, exists := sm.sessions[vpsID]; !exists {
		sm.sessions[vpsID] = make(map[string]bool)
	}

	sm.sessions[vpsID][sessionID] = true

	sm.timeLock.Lock()
	sm.creationTime[sessionID] = time.Now()
	sm.timeLock.Unlock()
}

// UnregisterSession removes a session from tracking
func (sm *SSHSessionManager) UnregisterSession(vpsID, sessionID string) {
	sm.sessionLock.Lock()
	defer sm.sessionLock.Unlock()

	if sessions, exists := sm.sessions[vpsID]; exists {
		delete(sessions, sessionID)
		if len(sessions) == 0 {
			delete(sm.sessions, vpsID)
		}
	}

	sm.timeLock.Lock()
	delete(sm.creationTime, sessionID)
	sm.timeLock.Unlock()
}

// GetActiveSessions returns all active session IDs for a VPS
func (sm *SSHSessionManager) GetActiveSessions(vpsID string) []string {
	sm.sessionLock.RLock()
	defer sm.sessionLock.RUnlock()

	sessions := make([]string, 0)
	if sessionMap, exists := sm.sessions[vpsID]; exists {
		for sessionID := range sessionMap {
			sessions = append(sessions, sessionID)
		}
	}

	return sessions
}

// CloseAllForVPS closes all sessions for a specific VPS
func (sm *SSHSessionManager) CloseAllForVPS(vpsID string) {
	sm.sessionLock.Lock()
	defer sm.sessionLock.Unlock()

	delete(sm.sessions, vpsID)
}

// GetTotalActiveSessions returns total active sessions count
func (sm *SSHSessionManager) GetTotalActiveSessions() int {
	sm.sessionLock.RLock()
	defer sm.sessionLock.RUnlock()

	total := 0
	for _, sessions := range sm.sessions {
		total += len(sessions)
	}

	return total
}

// cleanupExpiredSessions removes sessions idle for more than 2 hours
func (sm *SSHSessionManager) cleanupExpiredSessions() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	maxSessionDuration := 2 * time.Hour

	for range ticker.C {
		sm.timeLock.RLock()
		now := time.Now()
		var expiredSessions []string

		for sessionID, createdAt := range sm.creationTime {
			if now.Sub(createdAt) > maxSessionDuration {
				expiredSessions = append(expiredSessions, sessionID)
			}
		}
		sm.timeLock.RUnlock()

		// Remove expired sessions
		for _, sessionID := range expiredSessions {
			sm.timeLock.Lock()
			delete(sm.creationTime, sessionID)
			sm.timeLock.Unlock()

			sm.sessionLock.Lock()
			for vpsID := range sm.sessions {
				delete(sm.sessions[vpsID], sessionID)
			}
			sm.sessionLock.Unlock()
		}
	}
}
