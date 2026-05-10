package websocket

import (
	"sync"
	"time"

	gws "github.com/gofiber/websocket/v2"
)

type Client struct {
	ID        string
	Conn      *gws.Conn
	CreatedAt time.Time
	Send      chan []byte
}

type Manager struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

func NewManager() *Manager {
	return &Manager{clients: make(map[string]*Client)}
}

func (m *Manager) Register(c *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[c.ID] = c
}

func (m *Manager) Unregister(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if client, ok := m.clients[id]; ok {
		close(client.Send)
		delete(m.clients, id)
	}
}

func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.clients)
}

func (m *Manager) Broadcast(payload []byte) {
	m.mu.RLock()
	clients := make([]*Client, 0, len(m.clients))
	for _, c := range m.clients {
		clients = append(clients, c)
	}
	m.mu.RUnlock()
	for _, c := range clients {
		select {
		case c.Send <- payload:
		default:
		}
	}
}
