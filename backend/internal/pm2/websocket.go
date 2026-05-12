package pm2

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/websocket/v2"

	"skyport/internal/access"
	"skyport/internal/app"
	"skyport/internal/auth"
	wsinfra "skyport/internal/websocket"
)

// registerWebSocket mounts /ws/pm2 with JWT + pm2.manage permission.
func registerWebSocket(a *app.App, hub *StateHub) {
	a.Fiber.Use("/ws/pm2", func(c *fiber.Ctx) error {
		connHdr := strings.ToLower(c.Get("Connection"))
		upgHdr := strings.ToLower(c.Get("Upgrade"))
		if strings.Contains(connHdr, "upgrade") && strings.Contains(upgHdr, "websocket") {
			token := wsinfra.ExtractToken(c)
			if token == "" {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			claims, err := auth.ParseAccessToken(token, a.Config.JWTSecret)
			if err != nil {
				return c.SendStatus(fiber.StatusUnauthorized)
			}
			svc := access.NewService(a.DB)
			ok, err := svc.UserHasPermission(claims.UserID, access.PermPm2Manage)
			if err != nil || !ok {
				return c.SendStatus(fiber.StatusForbidden)
			}
		}
		return c.Next()
	})
	a.Fiber.Get("/ws/pm2", gws.New(func(c *gws.Conn) {
		hub.AddClient(c)
		defer hub.RemoveClient(c)
		for {
			if err := c.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
				return
			}
			_, _, err := c.ReadMessage()
			if err != nil {
				return
			}
		}
	}, gws.Config{Subprotocols: []string{"jwt"}}))
}
