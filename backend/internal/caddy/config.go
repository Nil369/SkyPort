package caddy

import (
	"fmt"
	"strings"
)

// GenerateCaddyfileContent generates a valid Caddyfile from proxy routes
func GenerateCaddyfileContent(routes []ReverseProxyConfig) string {
	if len(routes) == 0 {
		return "# SkyPort: No domain mappings configured\n"
	}

	var blocks []string
	blocks = append(blocks, "# Auto-generated Caddyfile by SkyPort")
	blocks = append(blocks, "# DO NOT EDIT MANUALLY - your changes will be overwritten")
	blocks = append(blocks, "")

	for _, route := range routes {
		block := GenerateRouteBlock(route)
		blocks = append(blocks, block)
		blocks = append(blocks, "")
	}

	return strings.Join(blocks, "\n")
}

// GenerateRouteBlock generates a single Caddy route block
func GenerateRouteBlock(cfg ReverseProxyConfig) string {
	domain := cfg.Domain

	// Ensure domain is properly formatted
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		if cfg.EnableSSL {
			domain = "https://" + domain
		} else {
			domain = "http://" + domain
		}
	}

	lines := []string{
		domain + " {",
	}

	// TLS configuration if SSL is enabled
	if cfg.EnableSSL && cfg.Email != "" {
		lines = append(lines, fmt.Sprintf("	tls %s", cfg.Email))
	}

	// Reverse proxy to localhost port
	lines = append(lines, fmt.Sprintf("	reverse_proxy localhost:%d", cfg.Port))
	lines = append(lines, "}")

	return strings.Join(lines, "\n")
}

// GenerateNginxConfigContent generates Nginx config (alternative to Caddy)
// Not primary focus but supported in model
func GenerateNginxConfigContent(routes []ReverseProxyConfig) string {
	if len(routes) == 0 {
		return "# SkyPort: No domain mappings configured\n"
	}

	var blocks []string
	blocks = append(blocks, "# Auto-generated Nginx config by SkyPort")
	blocks = append(blocks, "# DO NOT EDIT MANUALLY - your changes will be overwritten")
	blocks = append(blocks, "")

	for _, route := range routes {
		block := GenerateNginxServerBlock(route)
		blocks = append(blocks, block)
		blocks = append(blocks, "")
	}

	return strings.Join(blocks, "\n")
}

// GenerateNginxServerBlock generates a single Nginx server block
func GenerateNginxServerBlock(cfg ReverseProxyConfig) string {
	lines := []string{
		"server {",
		fmt.Sprintf("	server_name %s;", cfg.Domain),
		"	listen 80;",
	}

	if cfg.EnableSSL {
		lines = append(lines,
			"	listen 443 ssl;",
			fmt.Sprintf("	ssl_certificate /etc/nginx/ssl/%s.crt;", cfg.Domain),
			fmt.Sprintf("	ssl_certificate_key /etc/nginx/ssl/%s.key;", cfg.Domain),
		)
	}

	lines = append(lines,
		"	location / {",
		fmt.Sprintf("		proxy_pass http://localhost:%d;", cfg.Port),
		"		proxy_set_header Host $host;",
		"		proxy_set_header X-Real-IP $remote_addr;",
		"		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
		"		proxy_set_header X-Forwarded-Proto $scheme;",
		"	}",
		"}",
	)

	return strings.Join(lines, "\n")
}

// Format domain properly (strip protocol if present, ensure clean format)
func NormalizeDomain(domain string) string {
	domain = strings.TrimSpace(domain)
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")
	return strings.ToLower(domain)
}
