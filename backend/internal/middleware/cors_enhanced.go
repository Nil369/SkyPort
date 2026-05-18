// Package middleware provides HTTP middleware for SkyPort.
// This file extends CORS middleware with dynamic origin validation.
package middleware

import (
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

var allowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"
var allowedHeaders = "Authorization,Content-Type,X-Request-ID,X-Forwarded-For,X-Forwarded-Proto,X-Forwarded-Host"

// CORSConfig specifies CORS policies for a SkyPort deployment.
type CORSConfig struct {
	// AllowedOrigins contains exact origins or wildcard patterns (*.example.com)
	AllowedOrigins []string

	// AllowCredentials enables credentials in cross-origin requests
	AllowCredentials bool

	// MaxAge specifies preflight cache duration in seconds
	MaxAge int

	// DynamicOriginFunc allows custom origin validation logic
	DynamicOriginFunc func(origin string) bool
}

// CORS validates origin against exact and wildcard host patterns, with dynamic validation support.
// For self-hosted deployments, consider using DynamicOriginFunc for flexible origin handling.
func CORS(allowedOrigins []string) fiber.Handler {
	config := &CORSConfig{
		AllowedOrigins:   allowedOrigins,
		AllowCredentials: true,
		MaxAge:           3600,
	}
	return CORSWithConfig(config)
}

// CORSWithConfig provides advanced CORS handling with custom configuration.
func CORSWithConfig(config *CORSConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")
		if origin == "" {
			return c.Next()
		}

		var allowed bool

		// Check if "*" is in allowed origins (allow all)
		for _, rule := range config.AllowedOrigins {
			if strings.TrimSpace(rule) == "*" {
				allowed = true
				break
			}
		}

		// Check static origins first (if not already wildcard allowed)
		if !allowed && IsOriginAllowed(origin, config.AllowedOrigins) {
			allowed = true
		}

		// If not allowed by static list, try dynamic validation
		if !allowed && config.DynamicOriginFunc != nil {
			allowed = config.DynamicOriginFunc(origin)
		}

		if !allowed {
			return response.Error(c, fiber.StatusForbidden, "cors_forbidden", "origin not allowed")
		}

		c.Set("Vary", "Origin")
		c.Set("Access-Control-Allow-Origin", origin)

		if config.AllowCredentials {
			c.Set("Access-Control-Allow-Credentials", "true")
		}

		c.Set("Access-Control-Allow-Methods", allowedMethods)
		c.Set("Access-Control-Allow-Headers", allowedHeaders)
		c.Set("Access-Control-Max-Age", strconv.Itoa(config.MaxAge))

		if strings.EqualFold(c.Method(), fiber.MethodOptions) {
			return c.SendStatus(fiber.StatusNoContent)
		}

		return c.Next()
	}
}

// IsOriginAllowed checks if an origin is in the allowed list.
// Special case: "*" allows all origins (use with caution in production).
func IsOriginAllowed(origin string, allowed []string) bool {
	originURL, err := url.Parse(origin)
	if err != nil || originURL.Scheme == "" || originURL.Hostname() == "" {
		return false
	}

	for _, rule := range allowed {
		rule = strings.TrimSpace(rule)

		// Wildcard: allow all origins
		if rule == "*" {
			return true
		}

		if matchesOriginRule(originURL, rule) {
			return true
		}
	}

	return false
}

// matchesOriginRule checks if an origin matches a single rule (exact or wildcard).
func matchesOriginRule(originURL *url.URL, rule string) bool {
	if rule == "" {
		return false
	}

	ruleURL, err := url.Parse(rule)
	if err != nil {
		return false
	}

	// Scheme must match
	if !strings.EqualFold(ruleURL.Scheme, originURL.Scheme) {
		return false
	}

	originHost := strings.ToLower(originURL.Hostname())
	ruleHost := strings.ToLower(ruleURL.Hostname())

	// Exact match
	if strings.EqualFold(originURL.Host, ruleURL.Host) {
		return true
	}

	// Wildcard suffix match (*.example.com matches sub.example.com but not example.com)
	if strings.HasPrefix(ruleHost, "*.") {
		suffix := strings.TrimPrefix(ruleHost, "*.")
		return originHost != suffix && strings.HasSuffix(originHost, "."+suffix)
	}

	return false
}

// IsOriginSelfHosted performs a simple heuristic check for self-hosted deployments.
// Returns true for localhost, private IPs, and non-public domains.
func IsOriginSelfHosted(origin string) bool {
	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	hostname := originURL.Hostname()
	if hostname == "" {
		return false
	}

	// Localhost
	if hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1" {
		return true
	}

	// Private IPs
	ip := net.ParseIP(hostname)
	if ip != nil {
		return ip.IsPrivate()
	}

	// Custom domains without public TLD (assumed self-hosted)
	// Real check: not a known public domain/SaaS domain
	publicDomains := map[string]bool{
		"github.com": true, "gitlab.com": true, "bitbucket.org": true,
		"vercel.com": true, "netlify.com": true, "heroku.com": true,
		"aws.com": true, "azure.com": true, "google.com": true,
	}
	for domain := range publicDomains {
		if strings.HasSuffix(hostname, domain) {
			return false
		}
	}

	return true
}
