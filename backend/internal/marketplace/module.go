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
		app("PostgreSQL", "postgresql", "Databases", "Advanced open-source relational database with ACID compliance, full-text search, and JSON support. Perfect for complex queries and enterprise applications. Trusted by startups and large-scale deployments worldwide.", []string{"docker"}, []int{5432}, "database", "512Mi", "0.5", "TCP 5432", []string{"official", "database"}, true, true),
		app("MySQL", "mysql", "Databases", "Lightweight, widely-used relational database ideal for web applications and content management systems. Excellent performance for read-heavy workloads with simple, predictable schema requirements.", []string{"docker"}, []int{3306}, "database", "512Mi", "0.5", "TCP 3306", []string{"official", "database"}, false, true),
		app("MariaDB", "mariadb", "Databases", "Community-driven MySQL fork with enhanced features, better performance, and additional storage engines. Direct drop-in replacement with improved security and clustering capabilities.", []string{"docker"}, []int{3306}, "database", "512Mi", "0.5", "TCP 3306", []string{"official", "database"}, false, false),
		app("MongoDB", "mongodb", "Databases", "Document-oriented NoSQL database that stores data in flexible JSON-like documents. Ideal for applications with evolving schemas, rapid prototyping, and horizontal scaling requirements.", []string{"docker"}, []int{27017}, "database", "768Mi", "0.5", "TCP 27017", []string{"official", "database"}, true, true),
		app("Redis", "redis", "Databases", "High-performance in-memory data store used for caching, sessions, real-time analytics, and message queues. Blazing-fast operations with support for various data structures and pub/sub messaging.", []string{"docker"}, []int{6379}, "database", "256Mi", "0.25", "TCP 6379", []string{"cache", "database"}, true, true),
		app("Cassandra", "cassandra", "Databases", "Distributed NoSQL database designed for massive scale with high availability and fault tolerance. Handles petabyte-scale data with linear scalability across multiple nodes and data centers.", []string{"docker"}, []int{9042}, "database", "1Gi", "1", "TCP 9042", []string{"nosql", "cluster"}, false, false),

		app("Node.js Runtime", "node-runtime", "Backend", "JavaScript runtime for building scalable network applications, APIs, and real-time services. Excellent event-driven architecture with vast npm ecosystem for rapid development.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, true, true),
		app("Bun Runtime", "bun-runtime", "Backend", "Modern, ultra-fast JavaScript runtime as Node.js alternative with built-in bundler and test runner. Up to 3x faster than Node with better performance and lower resource consumption.", []string{"docker", "native"}, []int{3000}, "bun", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Deno Runtime", "deno-runtime", "Backend", "Secure TypeScript runtime built with modern standards, eliminating NPM complexity. First-class TypeScript support with permission-based security model and built-in tooling.", []string{"docker", "native"}, []int{8000}, "deno", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Python Runtime", "python-runtime", "Backend", "Versatile runtime for APIs, data processing, automation scripts, and machine learning workloads. Rich ecosystem with Django, FastAPI, and extensive scientific computing libraries.", []string{"docker", "native"}, []int{8000}, "python", "256Mi", "0.25", "HTTP GET /health", []string{"runtime", "backend"}, true, false),
		app("Go Runtime", "go-runtime", "Backend", "Compiled language delivering fast, single-binary deployments with built-in concurrency support. Ideal for microservices, CLI tools, and systems programming with minimal resource overhead.", []string{"docker", "native"}, []int{8080}, "go", "256Mi", "0.25", "HTTP GET /healthz", []string{"runtime", "backend"}, false, false),
		app("PHP Runtime", "php-runtime", "Backend", "Popular scripting language powering WordPress, Laravel, Symfony, and thousands of legacy/modern web applications. Extensive hosting support and vibrant framework ecosystem.", []string{"docker", "native"}, []int{8080}, "php", "256Mi", "0.25", "HTTP GET /", []string{"runtime", "backend"}, false, false),
		app("Java Runtime", "java-runtime", "Backend", "Enterprise-grade JVM runtime supporting Spring Boot, Quarkus, and other frameworks for robust applications. Battle-tested with comprehensive libraries and excellent performance at scale.", []string{"docker", "native"}, []int{8080}, "java", "512Mi", "0.5", "HTTP GET /actuator/health", []string{"runtime", "backend"}, false, false),

		app("Next.js", "nextjs", "Frontend", "React framework enabling server-side rendering, static generation, and full-stack applications. Built-in optimization, API routes, and automatic code splitting for production-ready apps.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /", []string{"frontend", "react"}, true, true),
		app("Nuxt", "nuxt", "Frontend", "Vue.js-powered universal application framework for SSR and static generation. Powerful routing, middleware, and plugin systems with minimal configuration needed.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /", []string{"frontend", "vue"}, false, false),
		app("Astro", "astro", "Frontend", "Modern framework for building content-rich websites with partial hydration and zero JavaScript. Perfect for blogs, marketing sites, and documentation with exceptional performance.", []string{"docker", "native"}, []int{4321}, "node", "384Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("Vite", "vite", "Frontend", "Lightning-fast build tool and dev server providing instant HMR and optimized production bundles. Minimal configuration with excellent support for React, Vue, Svelte, and vanilla projects.", []string{"docker", "native"}, []int{4173}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("React Static", "react-static", "Frontend", "Static React site generator optimized for fast, JAMstack-style deployments. Combines React flexibility with static site performance for marketing and documentation.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),
		app("Vue Static", "vue-static", "Frontend", "Vue-powered static site generation for blogs, documentation, and content portals. Fast page loads with Vue's elegant templating and reactive component system.", []string{"docker", "native"}, []int{3000}, "node", "256Mi", "0.25", "HTTP GET /", []string{"frontend", "static"}, false, false),

		app("WordPress", "wordpress", "CMS", "Industry-leading blogging and content management system powering 40%+ of websites. Extensive plugin ecosystem, themes, and hosting support for blogs, portfolios, and small businesses.", []string{"docker", "native"}, []int{80}, "php", "512Mi", "0.5", "HTTP GET /wp-login.php", []string{"cms", "php"}, true, true),
		app("Appwrite", "appwrite", "CMS", "Open-source backend platform providing authentication, databases, file storage, and API layer. SDK support across multiple languages with self-hosted option and scalable infrastructure.", []string{"docker"}, []int{80, 443}, "node", "1Gi", "1", "HTTP GET /v1/health", []string{"backend", "platform"}, false, false),

		app("Grafana", "grafana", "Monitoring", "Open-source visualization and monitoring platform for metrics and logs from any data source. Beautiful dashboards with alerting capabilities and extensive plugin ecosystem for observability.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/health", []string{"monitoring", "metrics"}, true, true),
		app("Prometheus", "prometheus", "Monitoring", "Time-series metrics collection and alerting system with powerful query language. Pull-based model with minimal dependencies, ideal for monitoring applications and infrastructure.", []string{"docker", "native"}, []int{9090}, "go", "512Mi", "0.5", "HTTP GET /-/ready", []string{"monitoring", "metrics"}, false, false),

		app("Docker Registry", "docker-registry", "DevOps", "Private container image registry for storing, versioning, and distributing Docker images. Complete control over artifact storage without relying on external registries.", []string{"docker"}, []int{5000}, "go", "256Mi", "0.25", "HTTP GET /v2/", []string{"devops", "images"}, true, false),
		app("Portainer Agent", "portainer-agent", "DevOps", "Lightweight agent for remote Docker daemon management through Portainer control plane. Enables secure multi-host Docker orchestration and container lifecycle management.", []string{"docker"}, []int{9001}, "go", "128Mi", "0.1", "TCP 9001", []string{"devops", "docker"}, false, false),

		app("RabbitMQ", "rabbitmq", "Messaging", "Robust message broker implementing AMQP protocol for reliable queuing and pub/sub patterns. Clustering support, persistence, and management UI for enterprise messaging workflows.", []string{"docker"}, []int{5672, 15672}, "erlang", "512Mi", "0.5", "HTTP GET /api/health/checks/local-alarms", []string{"messaging", "queue"}, false, false),
		app("NATS", "nats", "Messaging", "High-performance messaging system with pub/sub, request/reply, and queue patterns. Lightweight, fast, and secure with excellent throughput and minimal latency for real-time systems.", []string{"docker", "native"}, []int{4222}, "go", "128Mi", "0.1", "HTTP GET /healthz", []string{"messaging", "pubsub"}, false, false),

		app("Nginx", "nginx", "Networking", "High-performance web server and reverse proxy for routing, load balancing, and SSL termination. Lightweight, stable, and industry-standard for serving and proxying HTTP(S) traffic.", []string{"docker", "native"}, []int{80, 443}, "native", "128Mi", "0.1", "HTTP GET /", []string{"proxy", "web"}, false, false),

		app("VS Code Server", "vscode-server", "Developer Tools", "Official VS Code in a browser enabling remote development from anywhere with full IDE capabilities. Extensions, terminal, and debugging support with zero local setup required.", []string{"docker", "native"}, []int{8080}, "node", "512Mi", "0.5", "HTTP GET /", []string{"devtools", "editor"}, true, true),
		app("Code-Server", "code-server", "Developer Tools", "Community-maintained VS Code running in browser for remote development and collaborative coding. Lightweight alternative with SSH/VNC support and browser-only interface.", []string{"docker", "native"}, []int{8080}, "node", "512Mi", "0.5", "HTTP GET /healthz", []string{"devtools", "editor"}, false, false),

		app("MinIO", "minio", "Storage", "S3-compatible object storage for any scale deployment on-premises or at the edge. High-performance alternative to AWS S3 with strong data protection and simple API compatibility.", []string{"docker", "native"}, []int{9000, 9001}, "go", "512Mi", "0.5", "HTTP GET /minio/health/live", []string{"storage", "s3"}, true, true),
		app("Directus", "directus", "CMS", "Headless CMS built on SQL providing API-first content management with real-time database access. Powerful admin panel with role-based access control and no vendor lock-in.", []string{"docker", "native"}, []int{8055}, "node", "768Mi", "0.75", "HTTP GET /server/health", []string{"cms", "api"}, true, true),
		app("Strapi", "strapi", "CMS", "Flexible headless CMS with REST and GraphQL APIs for content delivery to any frontend. Customizable with content versioning, multi-language support, and plugin architecture.", []string{"docker", "native"}, []int{1337}, "node", "1Gi", "1", "HTTP GET /_health", []string{"cms", "api"}, true, false),
		app("PocketBase", "pocketbase", "Databases", "All-in-one backend platform combining database, auth, files, and realtime APIs in a single executable. SQLite-powered with built-in admin panel and excellent developer experience.", []string{"docker", "native"}, []int{8090}, "go", "256Mi", "0.25", "HTTP GET /api/health", []string{"backend", "sqlite"}, true, true),
		app("Supabase", "supabase", "Databases", "Open-source Firebase alternative built on Postgres providing auth, realtime sync, and storage. Database access, vector embeddings, and serverless functions for complete backend infrastructure.", []string{"docker"}, []int{5432, 8000, 3000}, "node", "2Gi", "1", "HTTP GET /health", []string{"backend", "platform"}, true, true),
		app("Meilisearch", "meilisearch", "Search", "Lightning-fast, user-friendly search engine with typo tolerance and filtering capabilities. Ideal for product search, autocomplete, and instant results with minimal configuration.", []string{"docker"}, []int{7700}, "rust", "512Mi", "0.5", "HTTP GET /health", []string{"search", "index"}, true, true),
		app("Typesense", "typesense", "Search", "Modern search engine combining ease-of-use with performance, featuring typo tolerance and faceting. RESTful API with multi-language support for building elegant search experiences.", []string{"docker"}, []int{8108}, "c++", "512Mi", "0.5", "HTTP GET /health", []string{"search", "index"}, false, false),
		app("Plausible", "plausible", "Analytics", "Privacy-focused web analytics platform compliant with GDPR and CCPA without tracking cookies. Lightweight script, simple dashboard, and no vendor lock-in for ethical analytics.", []string{"docker"}, []int{8000}, "elixir", "1Gi", "1", "HTTP GET /api/health", []string{"analytics", "privacy"}, true, false),
		app("Umami", "umami", "Analytics", "Lightweight, privacy-focused analytics tool as Google Analytics alternative. Instant setup, beautiful dashboard, and complete data ownership with minimal overhead.", []string{"docker", "native"}, []int{3000}, "node", "512Mi", "0.5", "HTTP GET /api/heartbeat", []string{"analytics", "privacy"}, false, true),
		app("Gitea", "gitea", "Developer Tools", "Lightweight Git service perfect for self-hosted source control without external dependencies. Fast setup with minimal resource requirements and excellent compatibility with Git workflows.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/healthz", []string{"git", "devtools"}, true, true),
		app("Forgejo", "forgejo", "Developer Tools", "Community fork of Gitea focusing on federation and decentralization with enhanced features. Self-hosted alternative to GitHub with strong privacy and independence guarantees.", []string{"docker", "native"}, []int{3000}, "go", "512Mi", "0.5", "HTTP GET /api/healthz", []string{"git", "devtools"}, true, false),
		app("Jenkins", "jenkins", "DevOps", "Automation server for CI/CD pipelines supporting distributed builds and extensive plugin ecosystem. Industry-standard for orchestrating complex build workflows across multiple agents.", []string{"docker", "native"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /login", []string{"ci", "build"}, true, true),
		app("Temporal", "temporal", "DevOps", "Workflow orchestration platform for building reliable, durable services at any scale. Handles failures, retries, and complex business logic with visibility and debuggability built-in.", []string{"docker"}, []int{7233, 8233}, "go", "1Gi", "1", "HTTP GET /health", []string{"workflow", "orchestration"}, false, false),
		app("Apache Kafka", "kafka", "Messaging", "Distributed event streaming platform for high-volume data pipelines and real-time applications. Partitioning, replication, and durability for reliable message distribution at scale.", []string{"docker"}, []int{9092}, "java", "2Gi", "1", "TCP 9092", []string{"streaming", "events"}, true, true),
		app("Elasticsearch", "elasticsearch", "Search", "Distributed search and analytics engine for full-text search, logging, and metrics analysis. RESTful API with powerful aggregations and visualization for petabyte-scale data.", []string{"docker"}, []int{9200}, "java", "2Gi", "1", "HTTP GET /_cluster/health", []string{"search", "analytics"}, true, true),
		app("OpenSearch", "opensearch", "Search", "Open-source search engine forked from Elasticsearch with enhanced security and features. Community-driven with strong emphasis on transparency and avoiding vendor lock-in.", []string{"docker"}, []int{9200}, "java", "2Gi", "1", "HTTP GET /_cluster/health", []string{"search", "analytics"}, false, true),
		app("Keycloak", "keycloak", "Identity", "Open-source identity and access management server with OAuth2, SAML, and OpenID Connect. Single sign-on, user federation, and fine-grained authorization for enterprise security.", []string{"docker", "native"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /health/ready", []string{"auth", "identity"}, true, true),
		app("Authentik", "authentik", "Identity", "Modern identity provider with flexible authorization engine supporting any authentication method. Built-in passwordless sign-up, recovery, and audit logging for security-first approach.", []string{"docker", "native"}, []int{9000}, "python", "1Gi", "1", "HTTP GET /if/health/live/", []string{"auth", "identity"}, true, false),
		app("Vaultwarden", "vaultwarden", "Security", "Lightweight Bitwarden-compatible password manager server written in Rust for self-hosting. Secure credential storage with strong encryption and cross-device synchronization.", []string{"docker", "native"}, []int{80}, "rust", "256Mi", "0.25", "HTTP GET /alive", []string{"security", "passwords"}, true, true),
		app("Uptime Kuma", "uptime-kuma", "Monitoring", "Beautiful monitoring dashboard and status pages for tracking service uptime and incidents. Push notifications, status page templates, and incident management for reliability assurance.", []string{"docker", "native"}, []int{3001}, "node", "256Mi", "0.25", "HTTP GET /", []string{"monitoring", "status"}, true, true),
		app("Ollama", "ollama", "AI", "Run large language models locally with simple API and no GPU required for some models. Privacy-first approach with offline capability for AI workloads without cloud dependencies.", []string{"docker", "native"}, []int{11434}, "go", "2Gi", "1", "HTTP GET /api/tags", []string{"ai", "models"}, true, true),
		app("n8n", "n8n", "Automation", "Open-source workflow automation platform for integrating apps and automating business processes. Visual builder, 400+ integrations, and self-hosted option for complete process control.", []string{"docker", "native"}, []int{5678}, "node", "768Mi", "0.75", "HTTP GET /healthz", []string{"automation", "workflow"}, true, true),
		app("Ghost", "ghost", "CMS", "Professional blogging platform with membership support, newsletters, and content management. Modern, fast, and focused on writers with clean interface and excellent reader engagement.", []string{"docker", "native"}, []int{2368}, "node", "512Mi", "0.5", "HTTP GET /ghost/api/admin/site/", []string{"cms", "blog"}, false, true),
		app("Appsmith", "appsmith", "Internal Tools", "Low-code platform for rapidly building internal tools and admin panels over databases. Drag-and-drop builder with 50+ widgets and integrations for instant productivity apps.", []string{"docker", "native"}, []int{8080}, "java", "1Gi", "1", "HTTP GET /api/v1/health", []string{"lowcode", "internal-tools"}, true, false),
		app("Budibase", "budibase", "Internal Tools", "Open-source low-code platform for building business applications quickly and securely. Self-hosted with SQL/NoSQL database support and comprehensive UI components for workflow apps.", []string{"docker", "native"}, []int{10000}, "node", "1Gi", "1", "HTTP GET /api/global/authtest", []string{"lowcode", "internal-tools"}, false, false),
		app("Coolify Agent", "coolify-agent", "DevOps", "Lightweight agent enabling remote workload management and deployment orchestration. Securely communicates with control plane for distributed application deployments.", []string{"docker"}, []int{8000}, "go", "128Mi", "0.1", "TCP 8000", []string{"agent", "devops"}, true, false),
		app("Redis Stack", "redis-stack", "Databases", "Redis extended with search, JSON, and time-series modules for enhanced functionality. Combines caching with full-text search and structured data capabilities.", []string{"docker", "native"}, []int{6379, 8001}, "database", "512Mi", "0.5", "TCP 6379", []string{"cache", "search"}, true, true),
		app("InfluxDB", "influxdb", "Databases", "Time-series database optimized for metrics, events, and analytics with high write throughput. Excellent retention policies, downsampling, and powerful query language for time-series data.", []string{"docker", "native"}, []int{8086}, "go", "512Mi", "0.5", "HTTP GET /health", []string{"metrics", "timeseries"}, false, true),
		app("VictoriaMetrics", "victoriametrics", "Monitoring", "High-performance Prometheus-compatible metrics backend with excellent compression and cost efficiency. Handles billion+ metrics with fast queries and flexible data retention.", []string{"docker", "native"}, []int{8428}, "go", "512Mi", "0.5", "HTTP GET /health", []string{"metrics", "timeseries"}, false, true),
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
