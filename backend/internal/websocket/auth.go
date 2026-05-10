package websocket

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ExtractToken supports query, Authorization header, and websocket protocol header.
func ExtractToken(c *fiber.Ctx) string {
	token := strings.TrimSpace(c.Query("token"))
	if token != "" {
		return token
	}

	authHeader := strings.TrimSpace(c.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[len("Bearer "):])
	}
	if authHeader != "" {
		return authHeader
	}

	// Some clients send "jwt,<token>" or just "<token>" in Sec-WebSocket-Protocol.
	proto := strings.TrimSpace(c.Get("Sec-WebSocket-Protocol"))
	if proto == "" {
		return ""
	}
	parts := strings.Split(proto, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		p := strings.TrimSpace(parts[i])
		if p != "" && !strings.EqualFold(p, "jwt") && !strings.EqualFold(p, "bearer") {
			return p
		}
	}
	return ""
}
