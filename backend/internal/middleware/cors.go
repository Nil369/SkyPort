package middleware

import (
	"net/url"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

var allowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
var allowedHeaders = "Authorization,Content-Type,X-Request-ID"

// CORS validates origin against exact and wildcard host patterns.
func CORS(allowedOrigins []string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")
		if origin == "" {
			return c.Next()
		}
		if !IsOriginAllowed(origin, allowedOrigins) {
			return response.Error(c, fiber.StatusForbidden, "origin_not_allowed", "origin is not allowed")
		}

		c.Set("Vary", "Origin")
		c.Set("Access-Control-Allow-Origin", origin)
		c.Set("Access-Control-Allow-Credentials", "true")
		c.Set("Access-Control-Allow-Methods", allowedMethods)
		c.Set("Access-Control-Allow-Headers", allowedHeaders)

		if strings.EqualFold(c.Method(), fiber.MethodOptions) {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return c.Next()
	}
}

func IsOriginAllowed(origin string, allowed []string) bool {
	originURL, err := url.Parse(origin)
	if err != nil || originURL.Scheme == "" || originURL.Hostname() == "" {
		return false
	}
	for _, rule := range allowed {
		if matchesOriginRule(originURL, strings.TrimSpace(rule)) {
			return true
		}
	}
	return false
}

func matchesOriginRule(originURL *url.URL, rule string) bool {
	if rule == "" {
		return false
	}
	ruleURL, err := url.Parse(rule)
	if err != nil {
		return false
	}
	if !strings.EqualFold(ruleURL.Scheme, originURL.Scheme) {
		return false
	}
	originHost := strings.ToLower(originURL.Hostname())
	ruleHost := strings.ToLower(ruleURL.Hostname())
	if strings.HasPrefix(ruleHost, "*.") {
		suffix := strings.TrimPrefix(ruleHost, "*.")
		return originHost != suffix && strings.HasSuffix(originHost, "."+suffix)
	}
	return strings.EqualFold(originURL.Host, ruleURL.Host)
}
