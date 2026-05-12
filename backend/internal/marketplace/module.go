package marketplace

import (
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/apps"
	"skyport/internal/auth"
	"skyport/internal/response"
)

// Module exposes the marketplace catalog.
type Module struct{}

func (m *Module) Name() string { return "marketplace" }

func (m *Module) Register(a *app.App) error {
	a.Fiber.Get("/assets/marketplace/:slug.svg", func(c *fiber.Ctx) error {
		slug := strings.TrimSpace(c.Params("slug"))
		app, ok := appBySlug(slug)
		if !ok {
			return c.SendStatus(http.StatusNotFound)
		}
		c.Type("svg", "utf-8")
		return c.SendString(renderAppSVG(app.Name, app.Category, slug))
	})

	r := a.Fiber.Group("/api/v1/marketplace", auth.RequireJWT(a.Config.JWTSecret))
	r.Get("/apps", func(c *fiber.Ctx) error {
		return response.OK(c, fiber.Map{"apps": catalog()})
	})
	return nil
}

func catalog() []apps.Manifest {
	asset := func(slug string) string {
		return fmt.Sprintf("/assets/marketplace/%s.svg", slug)
	}

	app := func(name, slug, category, description string, installModes []string, ports []int, runtime, memory, cpu, health string, tags []string, featured, trending bool) apps.Manifest {
		return apps.Manifest{
			Name:               name,
			Slug:               slug,
			Description:        description,
			Category:           category,
			Icon:               slug,
			ImageURL:           asset(slug),
			InstallModes:       installModes,
			Ports:              ports,
			Env:                map[string]string{},
			Healthcheck:        health,
			Runtime:            runtime,
			MemoryRequirements: memory,
			CPURequirements:    cpu,
			SupportedOS:        []string{"linux"},
			Tags:               tags,
			Featured:           featured,
			Trending:           trending,
		}
	}

	return []apps.Manifest{
		app("PostgreSQL", "postgresql", "Databases", "Object-relational database for production apps.", []string{"docker", "native"}, []int{5432}, "database", "512Mi", "0.5", "TCP 5432", []string{"official", "database"}, true, true),
		app("MySQL", "mysql", "Databases", "Popular relational database for web workloads.", []string{"docker", "native"}, []int{3306}, "database", "512Mi", "0.5", "TCP 3306", []string{"official", "database"}, false, true),
		app("MariaDB", "mariadb", "Databases", "Drop-in MySQL replacement with community support.", []string{"docker", "native"}, []int{3306}, "database", "512Mi", "0.5", "TCP 3306", []string{"official", "database"}, false, false),
		app("MongoDB", "mongodb", "Databases", "Document database for flexible schema workloads.", []string{"docker", "native"}, []int{27017}, "database", "768Mi", "0.5", "TCP 27017", []string{"official", "database"}, true, true),
		app("Redis", "redis", "Databases", "In-memory cache, queue, and data structure server.", []string{"docker", "native"}, []int{6379}, "database", "256Mi", "0.25", "TCP 6379", []string{"cache", "database"}, true, true),
		app("Cassandra", "cassandra", "Databases", "Distributed NoSQL database for large scale data.", []string{"docker"}, []int{9042}, "database", "1Gi", "1", "TCP 9042", []string{"nosql", "cluster"}, false, false),

		app("Node.js Runtime", "node-runtime", "Backend", "Build and run Node.js services and APIs.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, true, true),
		app("Bun Runtime", "bun-runtime", "Backend", "Fast JavaScript runtime for modern services.", []string{"docker", "native"}, []int{3000}, "bun", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Deno Runtime", "deno-runtime", "Backend", "Secure TypeScript runtime with built-in tooling.", []string{"docker", "native"}, []int{8000}, "deno", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Python Runtime", "python-runtime", "Backend", "Python app runtime for APIs, tasks, and automation.", []string{"docker", "native"}, []int{8000}, "python", "256Mi", "0.25", "HTTP GET /health", []string{"runtime", "backend"}, true, false),
		app("Go Runtime", "go-runtime", "Backend", "Compile and run Go services on the VPS.", []string{"docker", "native"}, []int{8080}, "go", "256Mi", "0.25", "HTTP GET /healthz", []string{"runtime", "backend"}, false, false),
		app("PHP Runtime", "php-runtime", "Backend", "PHP runtime for legacy and modern web apps.", []string{"docker", "native"}, []int{8080}, "php", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Java Runtime", "java-runtime", "Backend", "JVM runtime for Spring and JVM services.", []string{"docker", "native"}, []int{8080}, "java", "512Mi", "0.5", "HTTP GET /actuator/health", []string{"runtime", "backend"}, false, false),

		app("Next.js", "nextjs", "Frontend", "Deploy SSR and full-stack React applications.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /", []string{"frontend", "react"}, true, true),
		app("Nuxt", "nuxt", "Frontend", "Vue-powered universal app deployment.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /", []string{"frontend", "vue"}, false, false),
		app("Astro", "astro", "Frontend", "Content-focused static and hybrid frontends.", []string{"docker", "native"}, []int{4321}, "node", "384Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("Vite", "vite", "Frontend", "Fast frontend builds and static deployments.", []string{"docker", "native"}, []int{4173}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("React Static", "react-static", "Frontend", "Static React delivery for docs and marketing sites.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("Vue Static", "vue-static", "Frontend", "Static Vue deployment profile.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),

		app("WordPress", "wordpress", "CMS", "Classic PHP CMS for blogs and content sites.", []string{"docker", "native"}, []int{80}, "php", "512Mi", "0.5", "HTTP GET /wp-login.php", []string{"cms", "php"}, true, true),
		app("Appwrite", "appwrite", "CMS", "Backend platform with auth, storage, and database APIs.", []string{"docker"}, []int{80, 443}, "node", "1Gi", "1", "HTTP GET /v1/health", []string{"backend", "platform"}, false, false),

		app("Grafana", "grafana", "Monitoring", "Dashboards and observability visualization.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/health", []string{"monitoring", "metrics"}, true, true),
		app("Prometheus", "prometheus", "Monitoring", "Metrics scraping and alerting stack.", []string{"docker", "native"}, []int{9090}, "go", "512Mi", "0.5", "HTTP GET /-/ready", []string{"monitoring", "metrics"}, false, false),

		app("Docker Registry", "docker-registry", "DevOps", "Private image registry for your applications.", []string{"docker"}, []int{5000}, "go", "256Mi", "0.25", "HTTP GET /v2/", []string{"devops", "images"}, true, false),
		app("Portainer Agent", "portainer-agent", "DevOps", "Remote Docker agent for Portainer-style management.", []string{"docker"}, []int{9001}, "go", "128Mi", "0.1", "TCP 9001", []string{"devops", "docker"}, false, false),
		

		app("RabbitMQ", "rabbitmq", "Messaging", "AMQP broker for queues and reliable messaging.", []string{"docker", "native"}, []int{5672, 15672}, "erlang", "512Mi", "0.5", "HTTP GET /api/health/checks/local-alarms", []string{"messaging", "queue"}, false, false),
		app("NATS", "nats", "Messaging", "Simple, secure, and high-performance messaging.", []string{"docker", "native"}, []int{4222}, "go", "128Mi", "0.1", "HTTP GET /healthz", []string{"messaging", "pubsub"}, false, false),

		app("Nginx", "nginx", "Networking", "Reverse proxy and static web server.", []string{"docker", "native"}, []int{80, 443}, "native", "128Mi", "0.1", "HTTP GET /", []string{"proxy", "web"}, false, false),

		app("VS Code Server", "vscode-server", "Developer Tools", "Remote browser-based VS Code runtime.", []string{"docker", "native"}, []int{8080}, "node", "512Mi", "0.5", "HTTP GET /", []string{"devtools", "editor"}, true, true),
		app("Code-Server", "code-server", "Developer Tools", "Self-hosted VS Code in the browser.", []string{"docker", "native"}, []int{8080}, "node", "512Mi", "0.5", "HTTP GET /healthz", []string{"devtools", "editor"}, false, false),
	}
}

func appBySlug(slug string) (apps.Manifest, bool) {
	for _, app := range catalog() {
		if app.Slug == slug {
			return app, true
		}
	}
	return apps.Manifest{}, false
}

func renderAppSVG(name, category, slug string) string {
	seed := 0
	for _, r := range slug {
		seed = (seed*33 + int(r)) % 360
	}
	hueA := seed
	hueB := (seed + 38) % 360
	name = html.EscapeString(name)
	category = html.EscapeString(category)
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="%s">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%%" stop-color="hsl(%d 80%% 58%%)"/>
      <stop offset="100%%" stop-color="hsl(%d 70%% 40%%)"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" rx="48" fill="url(#g)"/>
  <rect x="48" y="48" width="864" height="444" rx="40" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.20)"/>
  <circle cx="168" cy="144" r="64" fill="rgba(255,255,255,0.18)"/>
  <text x="168" y="158" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" fill="white">%s</text>
  <text x="96" y="324" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="800" fill="white">%s</text>
  <text x="96" y="382" font-family="JetBrains Mono, Consolas, monospace" font-size="24" fill="rgba(255,255,255,0.82)">%s</text>
</svg>`, html.EscapeString(upperInitials(name)), hueA, hueB, html.EscapeString(upperInitials(name)), name, category)
}

func upperInitials(name string) string {
	parts := strings.Fields(strings.TrimSpace(name))
	if len(parts) == 0 {
		return "?"
	}
	if len(parts) == 1 {
		runes := []rune(parts[0])
		if len(runes) > 2 {
			runes = runes[:2]
		}
		return strings.ToUpper(string(runes))
	}
	first := []rune(parts[0])
	last := []rune(parts[len(parts)-1])
	return strings.ToUpper(string(first[:1]) + string(last[:1]))
}
