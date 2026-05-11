package terminal

import (
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

var oscPattern = regexp.MustCompile(`\x1b\][^\x07\x1b]*(\x07|\x1b\\)`)

func sanitizeTerminalOutput(in []byte) []byte {
	// Keep ANSI colors/styles so prompts render with highlighting.
	// Only strip OSC title sequences, which can clutter browser terminals.
	return []byte(oscPattern.ReplaceAllString(string(in), ""))
}

func runPTYSession(conn *gws.Conn, client *wsinfra.Client) {
	shell, args, env := terminalProcessConfig()
	cmd := exec.Command(shell, args...)
	cmd.Env = env

	var writeMu sync.Mutex
	write := func(mt int, payload []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
		return conn.WriteMessage(mt, payload)
	}

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

	lineBuf := make([]byte, 0, 256)
	handleInput := func(data []byte) error {
		for _, b := range data {
			switch b {
			case 0x7f, 0x08: // DEL / BS
				if len(lineBuf) > 0 {
					lineBuf = lineBuf[:len(lineBuf)-1]
					select {
					case client.Send <- []byte("\b \b"):
					default:
					}
				}
			case '\r', '\n':
				payload := append(append([]byte{}, lineBuf...), '\n')
				if _, err := stdin.Write(payload); err != nil {
					return err
				}
				lineBuf = lineBuf[:0]
				select {
				case client.Send <- []byte("\r\n"):
				default:
				}
			default:
				lineBuf = append(lineBuf, b)
				select {
				case client.Send <- []byte{b}:
				default:
				}
			}
		}
		return nil
	}

	for {
		select {
		case <-done:
			return true
		default:
			t, data, err := conn.ReadMessage()
			if err != nil {
				return true
			}
			if t == gws.TextMessage && len(data) > 0 && data[0] == '{' {
				// Resize is ignored for pipe fallback mode on Windows.
				continue
			}
			input := normalizeInput(data)
			if err := handleInput(input); err != nil {
				return true
			}
		}
	}
}

func normalizeInput(data []byte) []byte {
	// Keep terminal input raw for interactive clients (xterm.js sends per-keystroke data).
	// Map DEL -> BS on Windows so backspace consistently edits the current line.
	// xterm sends 0x7f; Windows shells typically expect 0x08.
	if runtime.GOOS == "windows" {
		out := make([]byte, len(data))
		copy(out, data)
		for i := range out {
			if out[i] == 0x7f {
				out[i] = 0x08
			}
		}
		return out
	}
	return data
}

func terminalProcessConfig() (string, []string, []string) {
	env := os.Environ()
	if runtime.GOOS == "windows" {
		ps := "powershell.exe"
		if _, err := exec.LookPath(ps); err == nil {
			// Blue + bold PowerShell prompt: `PS <cwd> >`
			command := `function global:prompt { "$([char]27)[1;34mPS $($executionContext.SessionState.Path.CurrentLocation)>$([char]27)[0m " }`
			return ps, []string{"-NoLogo", "-NoProfile", "-NoExit", "-Command", command}, env
		}
		return "cmd.exe", []string{"/Q", "/K", "prompt $P$G"}, env
	}

	shell := strings.TrimSpace(os.Getenv("SHELL"))
	if shell == "" {
		shell = "/bin/bash"
	}
	if _, err := exec.LookPath(shell); err != nil {
		if _, zshErr := exec.LookPath("/bin/zsh"); zshErr == nil {
			shell = "/bin/zsh"
		} else {
			shell = "/bin/sh"
		}
	}

	// Blue + bold prompt for bash/zsh-compatible shells.
	env = append(
		env,
		`PS1=\[\e[1;34m\]\u@\h:\w\$ \[\e[0m\] `,
		`PROMPT=%F{blue}%B%n@%m:%~%#%b%f `,
	)
	return shell, []string{"-l"}, env
}
