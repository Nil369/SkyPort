package v1

import (
	"encoding/json"
	"fmt"
	"io"
	"skyport/internal/app"
	"skyport/internal/vps"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"golang.org/x/crypto/ssh"
	"sync"
)

func mountTerminal(a *app.App, r fiber.Router) {
	fmt.Println("Registering VPS terminal WebSocket route under /ws/vps/:id")
	// Note: We use the root app to register /ws routes to match the proxy
	a.Fiber.Get("/ws/vps/:id", websocket.New(vpsTerminalHandler(a)))
}

type wsMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
	SessionId string `json:"sessionId"`
}

func vpsTerminalHandler(a *app.App) func(*websocket.Conn) {
	return func(c *websocket.Conn) {
		vpsID := c.Params("id")
		svc := vps.GetService(a)
		if svc == nil {
			c.WriteMessage(websocket.TextMessage, []byte("VPS service not initialized"))
			c.Close()
			return
		}

		// Get VPS info
		vpsServer, err := svc.GetVPS(vpsID)
		if err != nil {
			c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("VPS not found: %v", err)))
			c.Close()
			return
		}

		// Decrypt credentials and prepare auth
		// We need to reach into the service/db to get the encrypted credentials
		// This is a bit of a shortcut, ideally the service would handle this.
		// Since we're in the same project, we'll implement the connection logic here.
		
		// Re-fetch the full model to get encrypted fields
		var vpsModel vps.VPSServer
		if err := a.DB.First(&vpsModel, "id = ?", vpsID).Error; err != nil {
			c.WriteMessage(websocket.TextMessage, []byte("Failed to load server details"))
			c.Close()
			return
		}

		var auth ssh.AuthMethod
		if vpsModel.AuthType == "key" {
			keyContent, err := svc.Decrypt(string(vpsModel.EncryptedSSHKey))
			if err != nil {
				c.WriteMessage(websocket.TextMessage, []byte("Failed to decrypt SSH key"))
				c.Close()
				return
			}
			auth, err = vps.NewPublicKeyAuthMethod(keyContent)
			vps.SecureWipe(keyContent)
			if err != nil {
				c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Invalid SSH key: %v", err)))
				c.Close()
				return
			}
		} else {
			password, err := svc.Decrypt(string(vpsModel.EncryptedPassword))
			if err != nil {
				c.WriteMessage(websocket.TextMessage, []byte("Failed to decrypt password"))
				c.Close()
				return
			}
			auth = vps.NewPasswordAuthMethod(string(password))
			vps.SecureWipe(password)
		}

		// Create SSH session
		// Default size
		cols, rows := 80, 24
		
		session, err := svc.GetSessionManager().CreateSession(
			vpsID+"-"+time.Now().Format("150405"),
			vpsID,
			vpsServer.IPAddress,
			vpsServer.SSHPort,
			vpsServer.SSHUsername,
			auth,
			cols,
			rows,
		)

		if err != nil {
			c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31mFailed to connect: %v\x1b[0m\r\n", err)))
			c.Close()
			return
		}
		defer svc.GetSessionManager().CloseSession(session.ID)

		// Thread-safe writing
		var writeMu sync.Mutex
		write := func(mt int, payload []byte) error {
			writeMu.Lock()
			defer writeMu.Unlock()
			return c.WriteMessage(mt, payload)
		}

		fmt.Printf("VPS Terminal: Established SSH session %s for VPS %s\n", session.ID, vpsID)

		// Pipe SSH output to WebSocket
		done := make(chan struct{})
		go func() {
			defer close(done)
			buf := make([]byte, 1024*32)
			for {
				n, err := session.StdoutPipe.Read(buf)
				if n > 0 {
					if err := write(websocket.BinaryMessage, buf[:n]); err != nil {
						fmt.Printf("VPS Terminal: Write error (stdout): %v\n", err)
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						fmt.Printf("VPS Terminal: Read error (stdout): %v\n", err)
					}
					return
				}
			}
		}()

		go func() {
			buf := make([]byte, 1024*32)
			for {
				n, err := session.StderrPipe.Read(buf)
				if n > 0 {
					if err := write(websocket.BinaryMessage, buf[:n]); err != nil {
						fmt.Printf("VPS Terminal: Write error (stderr): %v\n", err)
						return
					}
				}
				if err != nil {
					return
				}
			}
		}()

		// Pipe WebSocket input to SSH session
		for {
			select {
			case <-done:
				fmt.Printf("VPS Terminal: Session %s ended\n", session.ID)
				return
			default:
				t, data, err := c.ReadMessage()
				if err != nil {
					fmt.Printf("VPS Terminal: WebSocket closed: %v\n", err)
					return
				}

				if t == websocket.TextMessage && len(data) > 0 && data[0] == '{' {
					var msg wsMessage
					if err := json.Unmarshal(data, &msg); err == nil {
						switch msg.Type {
						case "input":
							session.WriteInput([]byte(msg.Data))
						case "resize":
							if msg.Cols > 0 && msg.Rows > 0 {
								session.ResizeTerminal(msg.Cols, msg.Rows)
							}
						}
						continue
					}
				}
				
				// Fallback for raw data
				session.WriteInput(data)
			}
		}
	}
}
