package metrics

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"

	"skyport/internal/app"
	"skyport/internal/auth"
	"skyport/internal/response"
	wsinfra "skyport/internal/websocket"
)

const (
	wsMetricsInterval = 2 * time.Second
	wsWriteDeadline   = 15 * time.Second
)

// registerHTTP mounts REST endpoints on the Fiber app.
func registerHTTP(a *app.App) {
	a.Fiber.Get("/api/v1/metrics", metricsHandler(a))
}

// metricsHandler returns the latest metrics snapshot.
// @Summary Metrics snapshot
// @Tags Websocket
// @Description Returns the latest metrics snapshot
// @Produce json
// @Success 200 {object} map[string]any
// @Failure 503 {object} response.ErrorBody
// @Router /api/v1/metrics [get]
func metricsHandler(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.Metrics == nil {
			return response.Error(c, fiber.StatusServiceUnavailable, "metrics_unavailable", "metrics service not initialized")
		}
		snap, err := a.Metrics.Snapshot(c.UserContext())
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "metrics_collect_failed", err.Error())
		}
		return c.JSON(snap)
	}
}

// registerWebSocket mounts /ws/metrics with push-only streaming.
//
// Lifecycle: Fiber runs the handler in one goroutine per connection (library-managed).
// We use a single time.Ticker in that goroutine—no extra workers—so when the client
// disconnects or WriteMessage fails, the handler returns, defer stops the ticker, and
// the library releases the pooled Conn (no leaked tickers or goroutines).
func registerWebSocket(a *app.App) {
	a.Fiber.Use("/ws/metrics", func(c *fiber.Ctx) error {
		connHdr := strings.ToLower(c.Get("Connection"))
		upgHdr := strings.ToLower(c.Get("Upgrade"))
		if strings.Contains(connHdr, "upgrade") && strings.Contains(upgHdr, "websocket") {
			token := wsinfra.ExtractToken(c)
			if token == "" {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			if _, err := auth.ParseAccessToken(token, a.Config.JWTSecret); err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
		}
		return c.Next()
	})
	a.Fiber.Get("/ws/metrics", websocket.New(metricsWebSocketHandler(a), websocket.Config{
		Subprotocols: []string{"jwt"},
	}))
}

// metricsWebSocketHandler streams periodic metrics snapshots over WebSocket.
// @Summary Metrics stream (WebSocket)
// @Tags Websocket
// @Description Streams metrics snapshots every 2 seconds over WebSocket
// @Description Connect via ws://host/ws/metrics?token=<JWT> or with Authorization: Bearer <JWT> header
// @Router /ws/metrics [get]
func metricsWebSocketHandler(a *app.App) func(c *websocket.Conn) {
	return func(c *websocket.Conn) {
		if a.Metrics == nil {
			_ = c.WriteMessage(websocket.TextMessage, []byte(`{"error":{"code":"metrics_unavailable","message":"metrics service not initialized"}}`))
			_ = c.Close()
			return
		}

		ticker := time.NewTicker(wsMetricsInterval)
		defer ticker.Stop()

		send := func(ctx context.Context) bool {
			if err := c.SetWriteDeadline(time.Now().Add(wsWriteDeadline)); err != nil {
				return false
			}
			snap, err := a.Metrics.Snapshot(ctx)
			if err != nil {
				payload, jerr := json.Marshal(map[string]any{
					"error": map[string]string{
						"code":    "metrics_collect_failed",
						"message": err.Error(),
					},
				})
				if jerr != nil {
					return false
				}
				if err := c.WriteMessage(websocket.TextMessage, payload); err != nil {
					return false
				}
				return true
			}
			payload, err := json.Marshal(snap)
			if err != nil {
				return false
			}
			if err := c.WriteMessage(websocket.TextMessage, payload); err != nil {
				return false
			}
			return true
		}

		ctx := context.Background()
		if !send(ctx) {
			return
		}

		for range ticker.C {
			if !send(ctx) {
				return
			}
		}
	}
}
