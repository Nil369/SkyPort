package terminal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/websocket/v2"
	"github.com/google/uuid"

	"skyport/internal/app"
	"skyport/internal/auth"
	wsinfra "skyport/internal/websocket"
)

const (
	wsReadTimeout  = 120 * time.Second
	wsPingInterval = 30 * time.Second
	wsWriteTimeout = 15 * time.Second
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
			token := wsinfra.ExtractToken(c)

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
	a.Fiber.Get("/ws/terminal", gws.New(terminalHandler(), gws.Config{
		Subprotocols: []string{"jwt"},
	}))
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

var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)

func sanitizeTerminalOutput(in []byte) []byte {
	s := string(in)
	s = ansiPattern.ReplaceAllString(s, "")
	// Remove OSC and stray ESC bytes often emitted by prompt themes.
	s = strings.ReplaceAll(s, "\x1b]0;", "")
	s = strings.ReplaceAll(s, "\x1b", "")
	return []byte(s)
}

func runPTYSession(conn *gws.Conn, client *wsinfra.Client) {
	shell := "/bin/bash"
	args := []string{"-l"}
	if runtime.GOOS == "windows" {
		// Use cmd by default for web clients to avoid complex prompt themes/escape codes.
		shell = "cmd.exe"
		args = []string{"/Q", "/K", "prompt $P$G"}
		if _, err := exec.LookPath(shell); err != nil {
			shell = "powershell.exe"
			args = []string{"-NoLogo", "-NoProfile"}
		}
	}
	cmd := exec.Command(shell, args...)
	cmd.Env = os.Environ()

	var writeMu sync.Mutex
	write := func(mt int, payload []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
		return conn.WriteMessage(mt, payload)
	}

	_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	})

	stopPing := make(chan struct{})
	go pingLoop(write, stopPing)
	defer close(stopPing)

	f, err := pty.Start(cmd)
	if err != nil {
		if runtime.GOOS == "windows" {
			if runPipeShellSession(conn, client, shell, args...) {
				return
			}
		}
		_ = write(gws.TextMessage, []byte(fmt.Sprintf("failed to start shell: %v\n", err)))
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
				chunk := sanitizeTerminalOutput(append([]byte{}, buf[:n]...))
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
			if err := write(gws.TextMessage, msg); err != nil {
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
			_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
			if t == gws.TextMessage && len(data) > 0 && data[0] == '{' {
				var ctrl controlMessage
				if json.Unmarshal(data, &ctrl) == nil && ctrl.Type == "resize" && ctrl.Cols > 0 && ctrl.Rows > 0 {
					_ = pty.Setsize(f, &pty.Winsize{Cols: ctrl.Cols, Rows: ctrl.Rows})
					continue
				}
			}
			input := normalizeInput(data)
			if _, err := f.Write(input); err != nil {
				return
			}
		}
	}
}

func runPipeShellSession(conn *gws.Conn, client *wsinfra.Client, shell string, args ...string) bool {
	cmd := exec.Command(shell, args...)
	cmd.Env = os.Environ()

	var writeMu sync.Mutex
	write := func(mt int, payload []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
		return conn.WriteMessage(mt, payload)
	}

	_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	})
	stopPing := make(chan struct{})
	go pingLoop(write, stopPing)
	defer close(stopPing)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return false
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return false
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return false
	}
	if err := cmd.Start(); err != nil {
		return false
	}
	defer func() {
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	}()

	done := make(chan struct{})
	forward := func(r io.Reader) {
		buf := make([]byte, 2048)
		for {
			n, e := r.Read(buf)
			if n > 0 {
				chunk := sanitizeTerminalOutput(append([]byte{}, buf[:n]...))
				select {
				case client.Send <- chunk:
				default:
				}
			}
			if e != nil {
				break
			}
		}
	}

	go func() {
		defer close(done)
		go forward(stdout)
		go forward(stderr)
		_ = cmd.Wait()
	}()

	go func() {
		for msg := range client.Send {
			if err := write(gws.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return true
		default:
			t, data, err := conn.ReadMessage()
			if err != nil {
				return true
			}
			_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
			if t == gws.TextMessage && len(data) > 0 && data[0] == '{' {
				// Resize is ignored for pipe fallback mode on Windows.
				continue
			}
			input := normalizeInput(data)
			if _, err := stdin.Write(input); err != nil {
				return true
			}
		}
	}
}

func pingLoop(write func(int, []byte) error, stop <-chan struct{}) {
	ticker := time.NewTicker(wsPingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if err := write(gws.PingMessage, []byte("ping")); err != nil {
				return
			}
		}
	}
}

func normalizeInput(data []byte) []byte {
	// Postman sends one WS frame per Send click. If no newline is present,
	// append one so typical commands execute immediately.
	if len(data) > 0 && !bytes.Contains(data, []byte("\n")) && !bytes.Contains(data, []byte("\r")) {
		return append(append([]byte{}, data...), '\n')
	}
	return data
}
