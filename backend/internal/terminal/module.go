package terminal

import (
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/creack/pty"
	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"

	"skyport/internal/app"
	"skyport/internal/auth"
	wsinfra "skyport/internal/websocket"
)

type Module struct{}

func (m *Module) Name() string { return "terminal" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableTerminal {
		return nil
	}

	// Middleware for websocket auth - only for /ws/terminal
	a.Fiber.Use("/ws/terminal", func(c *fiber.Ctx) error {
		// Detect websocket upgrade (Connection may contain multiple tokens)
		connHdr := strings.ToLower(c.Get("Connection"))
		upgHdr := strings.ToLower(c.Get("Upgrade"))
		if strings.Contains(connHdr, "upgrade") && strings.Contains(upgHdr, "websocket") {
			// Extract token from query param, Authorization header, or Sec-WebSocket-Protocol
			token := strings.TrimSpace(c.Query("token"))
			if token == "" {
				authHeader := strings.TrimSpace(c.Get("Authorization"))
				if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
					token = strings.TrimSpace(authHeader[len("Bearer "):])
				} else if authHeader != "" {
					token = authHeader
				}
			}
			if token == "" {
				// Some websocket clients send token in Sec-WebSocket-Protocol
				proto := strings.TrimSpace(c.Get("Sec-WebSocket-Protocol"))
				if proto != "" {
					token = proto
				}
			}

			if token == "" {
				c.Set("X-Auth-Failed", "true")
				return c.SendStatus(fiber.StatusUnauthorized)
			}

			// Validate token
			if _, err := auth.ParseAccessToken(token, a.Config.JWTSecret); err != nil {
				c.Set("X-Auth-Failed", "true")
				return c.SendStatus(fiber.StatusUnauthorized)
			}
		}
		return c.Next()
	})

	// Register websocket handler
	a.Fiber.Get("/ws/terminal", gws.New(terminalHandler()))
	return nil
}

// terminalHandler opens an interactive terminal WebSocket session.
// @Summary Interactive terminal (WebSocket)
// @Tags Websocket
// @Description Opens an interactive shell session over WebSocket
// @Description Connect via ws://host/ws/terminal?token=<JWT> or with Authorization: Bearer <JWT> header
// @Description Send resize control: {"type":"resize","cols":80,"rows":24}
// @Router /ws/terminal [get]
func terminalHandler() func(*gws.Conn) {
	return func(conn *gws.Conn) {
		sessionID := uuid.NewString()
		manager := wsinfra.GlobalManager()
		client := &wsinfra.Client{
			ID:        sessionID,
			Conn:      conn,
			CreatedAt: time.Now().UTC(),
			Send:      make(chan []byte, 64),
		}
		manager.Register(client)
		defer manager.Unregister(sessionID)
		runPTYSession(conn, client)
	}
}

type controlMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func runPTYSession(conn *gws.Conn, client *wsinfra.Client) {
	shell := "/bin/bash"
	args := []string{"-l"}
	if runtime.GOOS == "windows" {
		shell = "powershell.exe"
		args = []string{"-NoLogo"}
	}
	cmd := exec.Command(shell, args...)
	cmd.Env = os.Environ()
	f, err := pty.Start(cmd)
	if err != nil {
		_ = conn.WriteMessage(gws.TextMessage, []byte("failed to start shell\n"))
		return
	}
	defer func() {
		_ = f.Close()
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	}()

	done := make(chan struct{})

	go func() {
		defer close(done)
		buf := make([]byte, 2048)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				chunk := append([]byte{}, buf[:n]...)
				select {
				case client.Send <- chunk:
				default:
				}
			}
			if err != nil {
				return
			}
		}
	}()

	go func() {
		for msg := range client.Send {
			if err := conn.WriteMessage(gws.BinaryMessage, msg); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		default:
			t, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if t == gws.TextMessage && len(data) > 0 && data[0] == '{' {
				var ctrl controlMessage
				if json.Unmarshal(data, &ctrl) == nil && ctrl.Type == "resize" && ctrl.Cols > 0 && ctrl.Rows > 0 {
					_ = pty.Setsize(f, &pty.Winsize{Cols: ctrl.Cols, Rows: ctrl.Rows})
					continue
				}
			}
			if _, err := io.WriteString(f, string(data)); err != nil {
				return
			}
		}
	}
}
