// Package middleware provides HTTP middleware for SkyPort.
// This file handles reverse proxy awareness.
package middleware

import (
	"net"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// TrustedProxyConfig configures proxy header handling.
type TrustedProxyConfig struct {
	// TrustedProxies are IPs that are trusted to set X-Forwarded-* headers
	TrustedProxies []string

	// AutoDetectScheme enables using X-Forwarded-Proto for determining HTTPS
	AutoDetectScheme bool

	// AutoDetectHost enables using X-Forwarded-Host for virtual hosting
	AutoDetectHost bool
}

// ProxyHeaders ensures X-Forwarded-* headers are properly handled and validated.
// This middleware should be applied after authentication but before handlers.
func ProxyHeaders(trustedProxies []string) fiber.Handler {
	return ProxyHeadersWithConfig(&TrustedProxyConfig{
		TrustedProxies:   trustedProxies,
		AutoDetectScheme: true,
		AutoDetectHost:   true,
	})
}

// ProxyHeadersWithConfig provides advanced proxy header handling.
func ProxyHeadersWithConfig(config *TrustedProxyConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clientIP := c.IP()

		// Check if the direct connection is from a trusted proxy
		isTrusted := false
		for _, trustedIP := range config.TrustedProxies {
			if matchIP(clientIP, trustedIP) {
				isTrusted = true
				break
			}
		}

		if isTrusted {
			// Extract the real client IP from X-Forwarded-For
			if forwarded := c.Get("X-Forwarded-For"); forwarded != "" {
				// X-Forwarded-For contains a comma-separated list; take the first (original client)
				if parts := strings.Split(forwarded, ","); len(parts) > 0 {
					realIP := strings.TrimSpace(parts[0])
					if net.ParseIP(realIP) != nil {
						c.Locals("client_ip", realIP)
					}
				}
			}

			// Use X-Forwarded-Proto for scheme detection
			if config.AutoDetectScheme {
				if proto := c.Get("X-Forwarded-Proto"); proto != "" {
					proto = strings.ToLower(strings.TrimSpace(proto))
					if proto == "https" || proto == "http" {
						c.Locals("scheme", proto)
						// Update c.Request().Header for downstream handlers
						c.Request().Header.Set("X-Forwarded-Proto", proto)
					}
				}
			}

			// Use X-Forwarded-Host for virtual host awareness
			if config.AutoDetectHost {
				if host := c.Get("X-Forwarded-Host"); host != "" {
					host = strings.TrimSpace(host)
					if host != "" {
						c.Locals("forwarded_host", host)
						c.Request().Header.Set("X-Forwarded-Host", host)
					}
				}
			}
		}

		return c.Next()
	}
}

// matchIP checks if an IP matches a CIDR or IP address.
func matchIP(clientIP, rule string) bool {
	rule = strings.TrimSpace(rule)

	// Exact match
	if clientIP == rule {
		return true
	}

	// CIDR match
	if strings.Contains(rule, "/") {
		_, network, err := net.ParseCIDR(rule)
		if err == nil {
			if ip := net.ParseIP(clientIP); ip != nil {
				return network.Contains(ip)
			}
		}
	}

	return false
}

// WebSocketUpgradeAware checks X-Forwarded-Proto to ensure secure WebSocket upgrades.
// Use this middleware before WebSocket handlers to ensure wss:// is used with https.
func WebSocketUpgradeAware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		proto := c.Get("X-Forwarded-Proto")
		if proto != "" {
			proto = strings.ToLower(strings.TrimSpace(proto))
			if proto == "https" {
				// Mark request as secure so WebSocket upgrade uses wss://
				c.Request().Header.Set("X-Forwarded-Proto", "https")
			}
		}
		return c.Next()
	}
}
