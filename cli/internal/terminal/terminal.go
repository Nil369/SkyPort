package terminal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/gorilla/websocket"
	"golang.org/x/term"
)

type Message struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

func Run(ctx context.Context, conn *websocket.Conn) error {
	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return err
	}
	defer term.Restore(int(os.Stdin.Fd()), oldState)

	cols, rows, _ := term.GetSize(int(os.Stdout.Fd()))
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 36
	}
	_ = conn.WriteJSON(Message{Type: "resize", Cols: cols, Rows: rows})

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(interrupt)

	var writeMu sync.Mutex
	write := func(mt int, payload []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(mt, payload)
	}

	go func() {
		buf := make([]byte, 8192)
		for {
			n, err := os.Stdin.Read(buf)
			if n > 0 {
				if err := write(websocket.TextMessage, buf[:n]); err != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	go func() {
		<-interrupt
		cancel()
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "interrupt"))
	}()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return err
			}
			if err := renderPayload(payload); err != nil {
				fmt.Fprint(os.Stdout, string(payload))
			}
		}
	}
}

func renderPayload(payload []byte) error {
	var envelope Message
	if json.Unmarshal(payload, &envelope) == nil && envelope.Type != "" {
		return nil
	}
	_, err := os.Stdout.Write(payload)
	return err
}