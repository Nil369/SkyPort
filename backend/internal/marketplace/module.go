package marketplace

import (
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/apps"
	"skyport/internal/auth"
	"skyport/internal/models"
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
	r.Get("/installs", listInstalls(a))
	r.Post("/installs", recordInstall(a))
	return nil
}

func listInstalls(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var rows []models.MarketplaceInstall
		if err := a.DB.Order("updated_at desc").Limit(200).Find(&rows).Error; err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "marketplace_installs_list_failed", err.Error())
		}
		out := make([]fiber.Map, 0, len(rows))
		for _, row := range rows {
			out = append(out, fiber.Map{
				"id":           row.ID,
				"app_slug":     row.AppSlug,
				"install_mode": row.InstallMode,
				"status":       row.Status,
				"notes":        row.Notes,
				"created_at":   row.CreatedAt.UTC().Format(time.RFC3339),
				"updated_at":   row.UpdatedAt.UTC().Format(time.RFC3339),
			})
		}
		return response.OK(c, fiber.Map{"installs": out})
	}
}

type recordInstallBody struct {
	AppSlug     string `json:"app_slug"`
	InstallMode string `json:"install_mode"`
	Status      string `json:"status"`
	Notes       string `json:"notes"`
}

func recordInstall(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body recordInstallBody
		if err := c.BodyParser(&body); err != nil {
			return response.BadRequest(c, "invalid request body")
		}
		slug := strings.TrimSpace(body.AppSlug)
		mode := strings.ToLower(strings.TrimSpace(body.InstallMode))
		if slug == "" || (mode != "native" && mode != "docker") {
			return response.BadRequest(c, "app_slug and install_mode (native|docker) are required")
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "recorded"
		}
		row := models.MarketplaceInstall{
			AppSlug:     slug,
			InstallMode: mode,
			Status:      status,
			Notes:       strings.TrimSpace(body.Notes),
		}
		if err := a.DB.Create(&row).Error; err != nil {
			return response.Error(c, fiber.StatusInternalServerError, "marketplace_install_record_failed", err.Error())
		}
		return response.JSON(c, fiber.StatusCreated, fiber.Map{
			"id":           row.ID,
			"app_slug":     row.AppSlug,
			"install_mode": row.InstallMode,
			"status":       row.Status,
			"notes":        row.Notes,
			"created_at":   row.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
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

		app("MinIO", "minio", "Storage", "S3-compatible object storage for local and edge workloads.", []string{"docker", "native"}, []int{9000, 9001}, "go", "512Mi", "0.5", "HTTP GET /minio/health/live", []string{"storage", "s3"}, true, true),
		app("Directus", "directus", "CMS", "Headless CMS and admin app for SQL backends.", []string{"docker", "native"}, []int{8055}, "node", "768Mi", "0.75", "HTTP GET /server/health", []string{"cms", "api"}, true, true),
		app("Strapi", "strapi", "CMS", "Open-source headless CMS for content APIs.", []string{"docker", "native"}, []int{1337}, "node", "1Gi", "1", "HTTP GET /_health", []string{"cms", "api"}, true, false),
		app("PocketBase", "pocketbase", "Databases", "All-in-one backend with realtime APIs and auth.", []string{"docker", "native"}, []int{8090}, "go", "256Mi", "0.25", "HTTP GET /api/health", []string{"backend", "sqlite"}, true, true),
		app("Supabase", "supabase", "Databases", "Open-source Postgres platform with auth, storage, and realtime.", []string{"docker"}, []int{5432, 8000, 3000}, "node", "2Gi", "1", "HTTP GET /health", []string{"backend", "platform"}, true, true),
		app("Meilisearch", "meilisearch", "Search", "Fast search engine for product and app search.", []string{"docker", "native"}, []int{7700}, "rust", "512Mi", "0.5", "HTTP GET /health", []string{"search", "index"}, true, true),
		app("Typesense", "typesense", "Search", "Typo-tolerant search engine for modern apps.", []string{"docker", "native"}, []int{8108}, "c++", "512Mi", "0.5", "HTTP GET /health", []string{"search", "index"}, false, false),
		app("Plausible", "plausible", "Analytics", "Privacy-focused analytics stack.", []string{"docker"}, []int{8000}, "elixir", "1Gi", "1", "HTTP GET /api/health", []string{"analytics", "privacy"}, true, false),
		app("Umami", "umami", "Analytics", "Self-hosted web analytics.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /api/heartbeat", []string{"analytics", "privacy"}, false, true),
		app("Gitea", "gitea", "Developer Tools", "Lightweight self-hosted Git service.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/healthz", []string{"git", "devtools"}, true, true),
		app("Forgejo", "forgejo", "Developer Tools", "Community-maintained fork of Gitea.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/healthz", []string{"git", "devtools"}, true, false),
		app("Jenkins", "jenkins", "DevOps", "Automation server for CI/CD pipelines.", []string{"docker", "native"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /login", []string{"ci", "build"}, true, true),
		app("Temporal", "temporal", "DevOps", "Workflow orchestration platform for durable services.", []string{"docker"}, []int{7233, 8233}, "go", "1Gi", "1", "HTTP GET /health", []string{"workflow", "orchestration"}, false, false),
		app("Apache Kafka", "kafka", "Messaging", "Distributed event streaming platform.", []string{"docker"}, []int{9092}, "java", "2Gi", "1", "TCP 9092", []string{"streaming", "events"}, true, true),
		app("Elasticsearch", "elasticsearch", "Search", "Distributed search and analytics engine.", []string{"docker"}, []int{9200}, "java", "2Gi", "1", "HTTP GET /_cluster/health", []string{"search", "analytics"}, true, true),
		app("OpenSearch", "opensearch", "Search", "Open-source search and analytics suite.", []string{"docker"}, []int{9200}, "java", "2Gi", "1", "HTTP GET /_cluster/health", []string{"search", "analytics"}, false, true),
		app("Keycloak", "keycloak", "Identity", "Identity and access management server.", []string{"docker", "native"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /health/ready", []string{"auth", "identity"}, true, true),
		app("Authentik", "authentik", "Identity", "Modern identity provider and access gateway.", []string{"docker"}, []int{9000}, "python", "1Gi", "1", "HTTP GET /if/health/live/", []string{"auth", "identity"}, true, false),
		app("Vaultwarden", "vaultwarden", "Security", "Bitwarden-compatible password manager server.", []string{"docker", "native"}, []int{80}, "rust", "256Mi", "0.25", "HTTP GET /alive", []string{"security", "passwords"}, true, true),
		app("Uptime Kuma", "uptime-kuma", "Monitoring", "Monitoring and status pages for services.", []string{"docker", "native"}, []int{3001}, "node", "256Mi", "0.25", "HTTP GET /", []string{"monitoring", "status"}, true, true),
		app("Ollama", "ollama", "AI", "Local model runner for LLM workloads.", []string{"docker", "native"}, []int{11434}, "go", "2Gi", "1", "HTTP GET /api/tags", []string{"ai", "models"}, true, true),
		app("n8n", "n8n", "Automation", "Workflow automation for integrations and webhooks.", []string{"docker", "native"}, []int{5678}, "node", "768Mi", "0.75", "HTTP GET /healthz", []string{"automation", "workflow"}, true, true),
		app("Ghost", "ghost", "CMS", "Modern publishing platform for blogs and memberships.", []string{"docker", "native"}, []int{2368}, "node", "512Mi", "0.5", "HTTP GET /ghost/api/admin/site/", []string{"cms", "blog"}, false, true),
		app("Appsmith", "appsmith", "Internal Tools", "Low-code app builder for internal tools.", []string{"docker"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /api/v1/health", []string{"lowcode", "internal-tools"}, true, false),
		app("Budibase", "budibase", "Internal Tools", "Open-source internal app platform.", []string{"docker"}, []int{10000}, "node", "1Gi", "1", "HTTP GET /api/global/authtest", []string{"lowcode", "internal-tools"}, false, false),
		app("Coolify Agent", "coolify-agent", "DevOps", "Agent for remote workload management.", []string{"docker"}, []int{8000}, "go", "128Mi", "0.1", "TCP 8000", []string{"agent", "devops"}, true, false),
		app("Redis Stack", "redis-stack", "Databases", "Redis plus search, JSON, and time-series modules.", []string{"docker", "native"}, []int{6379, 8001}, "database", "512Mi", "0.5", "TCP 6379", []string{"cache", "search"}, true, true),
		app("InfluxDB", "influxdb", "Databases", "Time-series database for metrics and IoT data.", []string{"docker", "native"}, []int{8086}, "go", "512Mi", "0.5", "HTTP GET /health", []string{"metrics", "timeseries"}, false, true),
		app("VictoriaMetrics", "victoriametrics", "Monitoring", "Fast metrics backend for Prometheus-compatible data.", []string{"docker", "native"}, []int{8428}, "go", "512Mi", "0.5", "HTTP GET /health", []string{"metrics", "timeseries"}, false, true),
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
