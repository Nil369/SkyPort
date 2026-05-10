package terminal

import (
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/creack/pty"
	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/middleware"
	wsinfra "skyport/internal/websocket"
)

type Module struct{}

func (m *Module) Name() string { return "terminal" }

func (m *Module) Register(a *app.App) error {
	if !a.Config.EnableTerminal {
		return nil
	}
	a.Fiber.Use("/ws/terminal", func(c *fiber.Ctx) error {
		if !gws.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}
		origin := c.Get("Origin")
		if origin != "" && !middleware.IsOriginAllowed(origin, a.Config.AllowedOrigins) {
			return fiber.ErrForbidden
		}
		token := c.Query("token")
		if token == "" {
			return fiber.ErrUnauthorized
		}
		if _, err := auth.ParseAccessToken(token, a.Config.JWTSecret); err != nil {
			return fiber.ErrUnauthorized
		}
		return c.Next()
	})

	a.Fiber.Get("/ws/terminal", gws.New(func(conn *gws.Conn) {
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
	}))
	return nil
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
