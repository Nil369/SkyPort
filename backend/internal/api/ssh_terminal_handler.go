package api

import (
	"fmt"
	"io"
	"time"

	"skyport/internal/vps"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

// SSHTerminalHandler handles SSH terminal WebSocket connections
type SSHTerminalHandler struct {
	vpsService *vps.Service
}

// NewSSHTerminalHandler creates a new SSH terminal handler
func NewSSHTerminalHandler(vpsService *vps.Service) *SSHTerminalHandler {
	return &SSHTerminalHandler{
		vpsService: vpsService,
	}
}

// RegisterSSHRoutes registers SSH terminal routes
func (h *SSHTerminalHandler) RegisterSSHRoutes(app *fiber.App) {
	app.Get("/api/v1/terminal/:vpsId/ws", websocket.New(h.HandleSSHTerminal))
}

// HandleSSHTerminal handles WebSocket SSH terminal connections
// @Summary SSH Terminal WebSocket
// @Tags Terminal
// @Param vpsId path string true "VPS ID"
// @Router /api/v1/terminal/{vpsId}/ws [get]
func (h *SSHTerminalHandler) HandleSSHTerminal(c *websocket.Conn) {
	vpsID := c.Params("vpsId")
	_ = uuid.New().String() // sessionID - for future use

	// Get VPS server configuration
	vpsResp, err := h.vpsService.GetVPS(vpsID)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("ERROR: VPS not found")))
		c.Close()
		return
	}

	// Get VPS data with encrypted credentials (internal use only)
	// This requires a method that returns the full VPS object
	// For now, we'll use a simplified approach

	c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Connected to %s", vpsResp.ServerName)))

	// Read messages from client
	for {
		messageType, message, err := c.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("WebSocket error: %v\n", err)
			}
			break
		}

		if messageType == websocket.TextMessage {
			// Parse message
			_ = vps.SSHMessage{} // msg - for future JSON unmarshaling
			// In production, use proper JSON unmarshaling
			// This is a simplified example

			// Handle terminal input
			if string(message) != "" {
				// Echo back for now (replace with actual SSH handling)
				c.WriteMessage(websocket.TextMessage, message)
			}
		}
	}
}

// StreamSSHOutput streams SSH command output to WebSocket
func (h *SSHTerminalHandler) StreamSSHOutput(
	c *websocket.Conn,
	session *vps.Session,
	done <-chan bool,
) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			// Read available output
			output, err := session.ReadOutput(100 * time.Millisecond)
			if err != nil && err != io.EOF {
				c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("ERROR: %v", err)))
				continue
			}

			if len(output) > 0 {
				c.WriteMessage(websocket.BinaryMessage, output)
			}
		}
	}
}
