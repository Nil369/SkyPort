import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Clock3, Cpu, Flame, HardDrive, Layers, Search, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "react-router";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { marketplaceApi, type MarketplaceApp } from "@/features/marketplace/api";
import { PERMS, can } from "@/lib/permissions";
import { useAuthStore } from "@/stores/authStore";
import StackIcon, { type IconName } from "tech-stack-icons";

export function MarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const appsQuery = useQuery({ queryKey: ["marketplace", "apps"], queryFn: marketplaceApi.listApps });
  const location = useLocation();

  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState<"all" | "docker" | "native">("all");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<MarketplaceApp | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState(1);
  const [installMethod, setInstallMethod] = React.useState<"docker" | "native">("docker");
  const [recent, setRecent] = React.useState<string[]>(() => safeReadRecent());

  React.useEffect(() => {
    const q = new URLSearchParams(location.search).get("q") ?? "";
    setQuery(q);
  }, [location.search]);

  const catalog = appsQuery.data ?? [];
  const categories = React.useMemo(() => ["all", ...Array.from(new Set(catalog.map((app) => app.category)))], [catalog]);
  const hasInstallAccess = can(user?.permissions, PERMS.marketplaceInstall);
  const hasActiveFilters = Boolean(query.trim()) || modeFilter !== "all" || categoryFilter !== "all";

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((app) => {
      const matchesQuery =
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.slug.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.tags?.some((tag) => tag.toLowerCase().includes(q));
      const matchesMode = modeFilter === "all" || app.install_modes.includes(modeFilter);
      const matchesCategory = categoryFilter === "all" || app.category === categoryFilter;
      return matchesQuery && matchesMode && matchesCategory;
    });
  }, [catalog, categoryFilter, modeFilter, query]);

  React.useEffect(() => {
    setPage(1);
  }, [query, modeFilter, categoryFilter]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  const shelfSource = hasActiveFilters ? filtered : catalog;
  const featured = React.useMemo(() => shelfSource.filter((app) => app.featured).slice(0, 6), [shelfSource]);
  const trending = React.useMemo(() => shelfSource.filter((app) => app.trending).slice(0, 6), [shelfSource]);
  const recentApps = React.useMemo(() => {
    const set = new Set(recent);
    return shelfSource.filter((app) => set.has(app.slug)).slice(0, 4);
  }, [shelfSource, recent]);

  const startInstall = (app: MarketplaceApp, method: "docker" | "native") => {
    setSelected(app);
    setInstallMethod(method);
    setWizardStep(1);
    setWizardOpen(true);
  };

  const markRecent = (slug: string) => {
    const next = [slug, ...recent.filter((item) => item !== slug)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem("skyport.marketplace.recent", JSON.stringify(next));
    } catch {
      // ignore storage issues
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Marketplace"
        subtitle="A manifest-driven ecosystem for databases, runtimes, CMS, observability, and infrastructure apps."
      />

      <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps, tags, categories…"
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={categoryFilter === category ? "default" : "outline"}
                onClick={() => setCategoryFilter(category)}
                className="capitalize"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="text-xs font-mono uppercase tracking-[0.22em] text-muted-foreground">Install modes</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={modeFilter === "all" ? "default" : "outline"} onClick={() => setModeFilter("all")}>
              All
            </Button>
            <Button size="sm" variant={modeFilter === "docker" ? "default" : "outline"} onClick={() => setModeFilter("docker")}>
              Docker
            </Button>
            <Button size="sm" variant={modeFilter === "native" ? "default" : "outline"} onClick={() => setModeFilter("native")}>
              Native
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">{appsQuery.isLoading ? "Loading catalog…" : `${filtered.length} apps`}</div>
        </div>
      </div>

      {appsQuery.isLoading ? (
        <MarketplaceSkeleton />
      ) : (
        <div className="space-y-6">
          {!hasActiveFilters ? (
            <>
              <MarketplaceShelf
                title="Featured apps"
                icon={<Sparkles className="size-4" />}
                apps={featured}
                canInstall={hasInstallAccess}
                onDetails={(app) => {
                  setSelected(app);
                  setWizardOpen(false);
                }}
                onInstall={startInstall}
              />
              <MarketplaceShelf
                title="Trending"
                icon={<Flame className="size-4" />}
                apps={trending}
                canInstall={hasInstallAccess}
                onDetails={(app) => {
                  setSelected(app);
                  setWizardOpen(false);
                }}
                onInstall={startInstall}
              />
              <MarketplaceShelf
                title="Recently installed"
                icon={<Clock3 className="size-4" />}
                apps={recentApps}
                canInstall={hasInstallAccess}
                emptyLabel="Open an install to seed this list."
                onDetails={(app) => {
                  setSelected(app);
                  setWizardOpen(false);
                }}
                onInstall={startInstall}
              />
            </>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((app) => (
              <MarketplaceCard
                key={app.slug}
                app={app}
                canInstall={hasInstallAccess}
                  onTagSearch={(value) => {
                    setQuery(value);
                    setSelected(null);
                    setWizardOpen(false);
                  }}
                onDetails={() => {
                  setSelected(app);
                  setWizardOpen(false);
                }}
                onInstall={(method) => startInstall(app, method)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              {filtered.length === 0 ? "No apps match this search." : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                Page {page} / {pageCount}
              </span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && (setSelected(null), setWizardOpen(false))}
        >
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {selected.image_url && getIconNameForApp(selected.slug) ? (
              <div className="h-48 w-full bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 flex items-center justify-center">
                <StackIcon name={getIconNameForApp(selected.slug)!} variant="dark" className="size-32" />
              </div>
            ) : null}
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="font-mono text-lg">{selected.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{selected.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.featured ? <Badge variant="success">Featured</Badge> : null}
                  {selected.trending ? <Badge variant="warning">Trending</Badge> : null}
                  {selected.install_modes.map((mode) => (
                    <Badge key={mode} variant="default" className="uppercase">
                      {mode}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">{selected.description}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoPill label="Ports" value={selected.ports.join(", ") || "-"} />
                <InfoPill label="Healthcheck" value={selected.healthcheck} />
                <InfoPill label="Runtime" value={selected.runtime} />
                <InfoPill label="RAM" value={selected.memory_requirements} />
                <InfoPill label="CPU" value={selected.cpu_requirements} />
                <InfoPill label="OS" value={selected.supported_os.join(", ")} />
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.tags?.map((tag) => (
                  <Badge key={tag} variant="info" className="uppercase">
                    {tag}
                  </Badge>
                ))}
              </div>
              {wizardOpen && hasInstallAccess ? (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    <ArrowRight className="size-4" /> Install wizard
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {["Choose method", "Configure", "Validate", "Deploy", "Logs"].map((label, index) => (
                      <div key={label} className="rounded-xl border border-border/70 bg-background p-3 text-xs">
                        <div className="mb-2 flex items-center gap-2">
                          <span className={index + 1 === wizardStep ? "size-2 rounded-full bg-primary" : "size-2 rounded-full bg-muted-foreground/40"} />
                          <span className="font-semibold">
                            {index + 1}. {label}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {index === 0
                            ? `Select ${installMethod === "docker" ? "Docker (recommended)" : "Native host install"}`
                            : index === 1
                              ? "Ports, env, domains, credentials"
                              : index === 2
                                ? "Port, memory, runtime validation"
                                : index === 3
                                  ? "Create deployment and stream progress"
                                  : "Realtime install logs and health checks"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background p-3">
                    <Button variant={installMethod === "docker" ? "default" : "outline"} size="sm" onClick={() => setInstallMethod("docker")}>
                      Docker (recommended)
                    </Button>
                    <Button variant={installMethod === "native" ? "default" : "outline"} size="sm" onClick={() => setInstallMethod("native")}>
                      Native host install
                    </Button>
                    <div className="ml-auto text-xs text-muted-foreground">
                      Realtime logs, rollback, and health checks will stream over websocket once wired to the deployment backend.
                    </div>
                  </div>
                  <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
                    Step 2/3 config fields will include ports, env, domains, credentials, volume mounts, and post-deploy health checks.
                  </div>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  {hasInstallAccess ? (
                    <Button size="sm" onClick={() => setWizardOpen((state) => !state)}>
                      {wizardOpen ? "Hide wizard" : "Open install wizard"}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      markRecent(selected.slug);
                      toast.success(`${selected.name} added to recently installed`);
                    }}
                  >
                    Mark recent
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => (setSelected(null), setWizardOpen(false))}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}

function MarketplaceCard({
  app,
  onDetails,
  onInstall,
  canInstall,
  onTagSearch,
}: {
  app: MarketplaceApp;
  onDetails: () => void;
  onInstall: (method: "docker" | "native") => void;
  canInstall: boolean;
  onTagSearch: (value: string) => void;
}) {
  const iconName = getIconNameForApp(app.slug);
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {app.image_url ? (
        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-950">
          {iconName ? (
            <div className="transition-transform duration-300 hover:scale-110">
              <StackIcon name={iconName} variant="light" className="size-24 opacity-95" />
            </div>
          ) : (
            <div className="flex size-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-3xl font-semibold text-white/90">
              {app.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            {app.featured ? <Badge variant="success">Featured</Badge> : <span />}
            {app.trending ? <Badge variant="warning">Trending</Badge> : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <div>
              <h3 className="text-sm font-semibold text-white">{app.name}</h3>
              <p className="text-xs text-slate-300">{app.category}</p>
            </div>
          </div>
        </div>
      ) : null}
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="font-mono text-base tracking-tight">{app.name}</CardTitle>
          <p className="text-xs text-muted-foreground">{app.category}</p>
        </div>
        <Layers className="size-5 text-primary/80" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">{app.description}</p>
        <div className="flex flex-wrap gap-1">
          {app.install_modes.map((mode) => (
            <Badge key={mode} variant="default" className="font-mono text-[10px] uppercase">
              {mode}
            </Badge>
          ))}
          {app.tags?.slice(0, 3).map((tag) => (
            <button key={tag} type="button" onClick={() => onTagSearch(tag)} className="transition-transform hover:-translate-y-0.5">
              <Badge variant="info" className="cursor-pointer font-mono text-[10px] uppercase">
                {tag}
              </Badge>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <HardDrive className="size-3.5" /> {app.memory_requirements}
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="size-3.5" /> {app.cpu_requirements}
          </span>
          <span className="flex items-center gap-1">
            <Box className="size-3.5" /> {app.runtime}
          </span>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Ports:</span> {app.ports.join(", ") || "-"}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={onDetails}>
            Details
          </Button>
          <Button size="sm" className="font-mono text-xs" disabled={!canInstall} onClick={() => onInstall("docker")}>
            Quick install
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Mapping of app slugs to tech-stack-icons names
// Comprehensive mapping for all marketplace apps
const TECH_STACK_ICON_MAP: Record<string, string> = {
  // Databases
  "postgresql": "postgresql",
  "postgres": "postgresql",
  "mysql": "mysql",
  "mariadb": "mariadb",
  "mongodb": "mongodb",
  "redis": "redis",
  "valkey": "redis",  // Valkey is Redis-compatible, use redis icon
  "influxdb": "influxdb",
  "cassandra": "cassandradb",

  // Runtimes
  "node-runtime": "nodejs",
  "bun-runtime": "bunjs",
  "deno-runtime": "deno",
  "python-runtime": "python",
  "go-runtime": "go",
  "php-runtime": "php",
  "java-runtime": "java",

  // Frontend Frameworks
  "nextjs": "nextjs",
  "nuxt": "nuxtjs",
  "astro": "astro",
  "vite": "vitejs",
  "react-static": "react",
  "vue-static": "vuejs",

  // CMS
  "wordpress": "wordpress",
  "appwrite": "appwrite",

  // Monitoring
  "uptime-kuma": "uptimekuma",
  "grafana": "grafana",
  "prometheus": "prometheus",
  "loki": "loki",
  "netdata": "netdata",

  // DevOps & Storage
  "docker-registry": "docker",
  "minio": "minio",
  "portainer-agent": "portainer",
  "gitea": "gitea",
  "drone-ci": "drone",
  "jenkins": "jenkins",
  "filebrowser": "filebrowser",
  "nextcloud": "nextjs",

  // Messaging
  "rabbitmq": "rabbitmq",
  "kafka": "kafka",
  "nats": "nats",

  // Networking
  "nginx": "nginx",
  "traefik": "traefik",
  "caddy": "caddy",

  // Security
  "vaultwarden": "bitwarden",
  "authentik": "authentik",
  "keycloak": "keycloak",

  // Analytics
  "plausible": "plausible",
  "umami": "umami",
  "metabase": "metabase",

  // Developer Tools
  "vscode-server": "vscode",
  "code-server": "vscode",
  "jupyterlab": "jupyter",

  // Fallback mappings
  "nodejs": "nodejs2",
  "node-js": "nodejs2",
  "python": "python",
  "java": "java",
  "go": "go",
  "golang": "go",
  "rust": "rust",
  "php": "php",
  "dotnet": "dotnet",
  "ruby": "ruby",
  "bun": "bunjs",
  "bunjs": "bunjs",
  "deno": "deno",
  "next": "nextjs",
  "react": "react",
  "vue": "vue",
  "angular": "angular",
  "vitejs": "vitejs",
  "docker": "docker",
  "kubernetes": "kubernetes",
  "k8s": "kubernetes",
  "terraform": "terraform",
  "gitlab": "gitlab",
  "github": "github",
  "mosquitto": "mosquitto",
  "datadog": "datadog",
  "newrelic": "newrelic",
  "sentry": "sentry",
  "logstash": "logstash",
  "kibana": "kibana",
};

function getAppIconName(slug: string): string {
  const normalized = slug.toLowerCase();
  if (TECH_STACK_ICON_MAP[normalized]) {
    return TECH_STACK_ICON_MAP[normalized];
  }
  for (const [key, value] of Object.entries(TECH_STACK_ICON_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return normalized;
}

function getIconNameForApp(slug: string): IconName | null {
  return getAppIconName(slug) as IconName;
}

function MarketplaceShelf({
  title,
  icon,
  apps,
  onInstall,
  onDetails,
  canInstall,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  apps: MarketplaceApp[];
  onInstall: (app: MarketplaceApp, method: "docker" | "native") => void;
  onDetails: (app: MarketplaceApp) => void;
  canInstall: boolean;
  emptyLabel?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {apps.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <MarketplaceCard
              key={app.slug}
              app={app}
              canInstall={canInstall}
              onTagSearch={() => undefined}
              onDetails={() => onDetails(app)}
              onInstall={(method) => onInstall(app, method)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
          {emptyLabel ?? "No apps in this section."}
        </div>
      )}
    </section>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="overflow-hidden border-border/60">
            <Skeleton className="h-44 w-full rounded-none" />
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xs text-foreground">{value || "-"}</div>
    </div>
  );
}

function safeReadRecent() {
  try {
    const raw = localStorage.getItem("skyport.marketplace.recent");
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}
