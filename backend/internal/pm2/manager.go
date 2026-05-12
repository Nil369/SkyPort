package pm2

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	gws "github.com/gofiber/websocket/v2"
)

const (
	// wsPushInterval is the server-side refresh cadence while at least one PM2 WebSocket client is connected.
	// Not aggressive: state is pushed only when the signature changes, except for periodic keepalive snapshots.
	wsPushInterval = 5 * time.Second
	wsWriteTimeout = 12 * time.Second
)

// StateHub coordinates PM2 snapshot refresh and WebSocket fan-out (host-native PM2 only).
type StateHub struct {
	svc *Service

	mu          sync.Mutex
	clients     map[*gws.Conn]struct{}
	loopStop    chan struct{}
	loopRunning bool
	prevByName  map[string]ProcessDTO
	// lastSentSignature avoids writing identical payloads on idle ticks (reduces WS noise).
	lastSentSignature string
}

// NewStateHub builds a hub backed by the given service (typically NewService()).
func NewStateHub(svc *Service) *StateHub {
	if svc == nil {
		svc = NewService()
	}
	return &StateHub{
		svc:     svc,
		clients: map[*gws.Conn]struct{}{},
	}
}

func (h *StateHub) AddClient(c *gws.Conn) {
	h.mu.Lock()
	if h.clients == nil {
		h.clients = make(map[*gws.Conn]struct{})
	}
	h.clients[c] = struct{}{}
	n := len(h.clients)
	needStart := n == 1 && !h.loopRunning
	if needStart {
		h.loopStop = make(chan struct{})
		h.loopRunning = true
		go h.refreshLoop(h.loopStop)
	}
	h.mu.Unlock()

	p := h.collect(context.Background(), "connect")
	_ = h.pushToConn(c, p)
	h.mu.Lock()
	h.lastSentSignature = p.Signature
	h.mu.Unlock()
}

// RemoveClient unregisters a client; stops the refresh loop when the last client disconnects.
func (h *StateHub) RemoveClient(c *gws.Conn) {
	h.mu.Lock()
	delete(h.clients, c)
	empty := len(h.clients) == 0
	var stopCh chan struct{}
	if empty && h.loopRunning {
		stopCh = h.loopStop
		h.loopRunning = false
		h.loopStop = nil
	}
	h.mu.Unlock()
	if stopCh != nil {
		close(stopCh)
	}
}

// BroadcastRefresh forces a snapshot and pushes to all subscribers if the signature changed (or always on demand).
func (h *StateHub) BroadcastRefresh(ctx context.Context, reason string) {
	payload := h.collect(ctx, reason)
	h.mu.Lock()
	h.lastSentSignature = ""
	conns := make([]*gws.Conn, 0, len(h.clients))
	for c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.Unlock()
	for _, c := range conns {
		_ = h.pushToConn(c, payload)
	}
	h.mu.Lock()
	h.lastSentSignature = payload.Signature
	h.mu.Unlock()
}

func (h *StateHub) refreshLoop(stop <-chan struct{}) {
	t := time.NewTicker(wsPushInterval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			payload := h.collect(context.Background(), "tick")
			h.mu.Lock()
			quiet := payload.Signature == h.lastSentSignature && len(payload.Events) == 0
			if quiet {
				h.mu.Unlock()
				continue
			}
			h.lastSentSignature = payload.Signature
			conns := make([]*gws.Conn, 0, len(h.clients))
			for c := range h.clients {
				conns = append(conns, c)
			}
			h.mu.Unlock()
			for _, c := range conns {
				_ = h.pushToConn(c, payload)
			}
		}
	}
}

func (h *StateHub) collect(ctx context.Context, reason string) *SnapshotPayload {
	bin, binErr := ResolveBinary()
	pm2Bin := ""
	if binErr == nil {
		pm2Bin = bin
	}

	payload := &SnapshotPayload{
		Type:      "pm2_snapshot",
		Reason:    reason,
		Collected: time.Now().UnixMilli(),
		PM2Binary: pm2Bin,
	}
	if binErr != nil {
		payload.Processes = nil
		payload.Signature = "unavailable"
		return payload
	}

	list, err := h.svc.ListProcesses(ctx)
	if err != nil {
		payload.Signature = "error:" + err.Error()
		payload.Processes = nil
		return payload
	}

	sig := fingerprint(list)

	h.mu.Lock()
	prevSnap := h.prevByName
	nextMap := make(map[string]ProcessDTO, len(list))
	for _, p := range list {
		nextMap[p.Name] = p
	}
	h.prevByName = nextMap
	h.mu.Unlock()

	events := diffEvents(prevSnap, list)

	payload.Processes = list
	payload.Signature = sig
	payload.Events = events
	return payload
}

func (h *StateHub) pushToConn(c *gws.Conn, p *SnapshotPayload) bool {
	if p == nil {
		return true
	}
	_ = c.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	raw, err := json.Marshal(p)
	if err != nil {
		return false
	}
	if err := c.WriteMessage(gws.TextMessage, raw); err != nil {
		return false
	}
	return true
}

func fingerprint(list []ProcessDTO) string {
	var b strings.Builder
	for _, p := range list {
		port0 := 0
		if len(p.Ports) > 0 {
			port0 = p.Ports[0]
		}
		fmt.Fprintf(&b, "%s|%s|%d|%d|%.3f|%d|%d|%d|%s|%s|%d\n",
			p.Name, p.Status, p.PMID, p.PID, p.CPU, p.MemoryBytes, p.UptimeSec, p.Restarts,
			p.Framework, p.GroupKey, port0)
	}
	return b.String()
}

func diffEvents(prev map[string]ProcessDTO, next []ProcessDTO) []EventDTO {
	if prev == nil {
		return nil
	}
	var ev []EventDTO
	for _, p := range next {
		old, ok := prev[p.Name]
		if !ok {
			continue
		}
		if old.Status != p.Status {
			kind := "state_change"
			msg := fmt.Sprintf("%s → %s", old.Status, p.Status)
			if (old.Status == "online" || old.Status == "launching") && (p.Status == "stopped" || p.Status == "errored" || p.Status == "stopping") {
				kind = "crash"
				msg = "process left healthy state: " + msg
			}
			ev = append(ev, EventDTO{Kind: kind, Name: p.Name, PrevStatus: old.Status, NextStatus: p.Status, Message: msg})
		}
		if p.Restarts > old.Restarts {
			ev = append(ev, EventDTO{
				Kind:    "restart",
				Name:    p.Name,
				Message: fmt.Sprintf("restart counter increased (%d → %d)", old.Restarts, p.Restarts),
			})
		}
	}
	return ev
}
