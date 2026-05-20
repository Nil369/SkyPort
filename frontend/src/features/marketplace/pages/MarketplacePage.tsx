import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Clock3, Cpu, Flame, HardDrive, Layers, ListChecks, Search, Sparkles, ArrowRight } from "lucide-react";
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
import { platformApi } from "@/features/platform/api";
import { PERMS, can } from "@/lib/permissions";
import { useAuthStore } from "@/stores/authStore";
import StackIcon from "tech-stack-icons";
import {
  siStrapi,
  siTemporal,
  siDirectus,
  siSupabase,
  siGhost,
  siMeilisearch,
  siElasticsearch,
  siOpensearch,
  siForgejo,
  siAuthentik,
  siBitwarden,
  siUptimekuma,
  siN8n,
  siPocketbase,
  siNginx,
  siNatsdotio,
  siApachekafka,
  siApachecassandra,
  siJupyter,
  siElixir,
  siErlang,
  siCplusplus,
  siC,
  siGitea,
} from "simple-icons";

export function MarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const appsQuery = useQuery({ queryKey: ["marketplace", "apps"], queryFn: marketplaceApi.listApps });
  const systemQuery = useQuery({ queryKey: ["system", "info"], queryFn: platformApi.systemInfo });
  const location = useLocation();

  const [installedOpen, setInstalledOpen] = React.useState(false);
  const installsQuery = useQuery({
    queryKey: ["marketplace-installs"],
    queryFn: marketplaceApi.listInstalls,
    enabled: installedOpen,
  });

  const recordInstallMutation = useMutation({
    mutationFn: marketplaceApi.recordInstall,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-installs"] }),
  });

  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState<"all" | "docker" | "native">("all");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<MarketplaceApp | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState(1);
  const [installMethod, setInstallMethod] = React.useState<"docker" | "native">("docker");
  const [recent, setRecent] = React.useState<string[]>(() => safeReadRecent());

  const hostOs = React.useMemo(() => detectHostOs(systemQuery.data), [systemQuery.data]);
  const totalRamBytes = React.useMemo(() => Number((systemQuery.data as any)?.memory?.total_bytes ?? 0), [systemQuery.data]);

  React.useEffect(() => {
    const q = new URLSearchParams(location.search).get("q") ?? "";
    setQuery(q);
  }, [location.search]);

  const [installHostPort, setInstallHostPort] = React.useState("");
  const [installEnvText, setInstallEnvText] = React.useState("");
  const [validationSummary, setValidationSummary] = React.useState<string | null>(null);
  const [installFeedback, setInstallFeedback] = React.useState("");
  const [installTriggered, setInstallTriggered] = React.useState(false);

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
    setInstallHostPort(String(app.ports[0] ?? ""));
    setInstallEnvText(
      Object.entries(app.env ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
    setValidationSummary(null);
    setInstallFeedback("");
    setInstallTriggered(false);
  };

  const recommendedInstallMethod = React.useMemo(() => {
    if (!selected) return installMethod;
    if (selected.install_modes.includes(installMethod)) return installMethod;
    if (selected.install_modes.includes("native") && hostOs !== "windows") return "native";
    return "docker";
  }, [hostOs, installMethod, selected]);

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("no selection");
      if (installMethod === "docker") {
        return { kind: "docker" as const, status: await platformApi.dockerStatus() };
      }
      const rt = mapCatalogRuntimeToInstaller(selected);
      if (!rt) {
        return { kind: "native_skip" as const };
      }
      const preview = await platformApi.runtimeInstall(rt, false);
      return { kind: "native" as const, preview };
    },
    onSuccess: (res) => {
      if (!selected) return;
      if (res.kind === "docker") {
        const s = res.status;
        setValidationSummary(
          s.installed
            ? s.daemon_running
              ? `Docker OK (${s.version ?? "version unknown"}). Ready to run containers.`
              : "Docker is installed but the daemon is not running. Start Docker Desktop or the docker service, then retry."
            : "Docker is not installed on this host. Install Docker or switch to native (when supported).",
        );
        return;
      }
      if (res.kind === "native_skip") {
        setValidationSummary(
          `Native installers are not wired for runtime "${selected.runtime}" (common for databases). Prefer Docker for ${selected.name}, or install packages manually on ${hostOs}.`,
        );
        return;
      }
      const msg = (res.preview as { message?: string })?.message ?? "";
      const result = (res.preview as { result?: { commands?: string[]; output?: string } })?.result;
      const cmds = result?.commands?.join("\n") ?? "";
      setValidationSummary([msg, cmds, result?.output].filter(Boolean).join("\n\n") || "Validation preview ready.");
    },
    onError: (err: unknown) => {
      const m = err instanceof Error ? err.message : "Validation failed";
      setValidationSummary(m);
    },
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("no selection");
      if (installMethod === "docker") {
        return { kind: "docker" as const, command: buildDockerRunCommand(selected, installHostPort, installEnvText) };
      }
      const rt = mapCatalogRuntimeToInstaller(selected);
      if (!rt) throw new Error("native_install_unsupported");
      return { kind: "native" as const, body: await platformApi.runtimeInstall(rt, true) };
    },
    onSuccess: (res) => {
      const app = selected;
      if (app) {
        const notes =
          res.kind === "docker"
            ? res.command.slice(0, 2000)
            : JSON.stringify(res.body, null, 2).slice(0, 2000);
        recordInstallMutation.mutate({
          app_slug: app.slug,
          install_mode: res.kind === "docker" ? "docker" : "native",
          status: res.kind === "docker" ? "docker_command_generated" : "native_install_finished",
          notes,
        });
      }
      if (res.kind === "docker") {
        setInstallFeedback((prev) =>
          `${prev}\n\n--- Docker ---\n${res.command}\n\nCopy this command into the Terminal page or your shell. SkyPort does not pick a single image for every catalog entry; adjust image/tag as needed.`,
        );
        setInstallTriggered(true);
        toast.success("Docker run command generated — see install log");
        return;
      }
      setInstallFeedback((prev) => `${prev}\n\n--- Native install ---\n${JSON.stringify(res.body, null, 2)}`);
      setInstallTriggered(true);
      toast.success("Native install request finished — see install log");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const m = ax?.response?.data?.error?.message ?? ax?.message ?? "Install failed";
      setInstallFeedback((prev) => `${prev}\n\nERROR: ${m}`);
      toast.error(m);
    },
  });

  const advanceInstallFlow = () => {
    if (!selected) return;
    if (wizardStep < 5) {
      setWizardStep((step) => Math.min(5, step + 1));
      return;
    }
    markRecent(selected.slug);
    if (installTriggered) {
      toast.success(`${selected.name} install wizard finished. You can track progress in the history tab.`);
    } else {
      toast(`${selected.name} wizard closed without running installer.`, { icon: "ℹ️" });
    }
    setWizardOpen(false);
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
        right={
          <Button type="button" variant="outline" size="sm" className="gap-2 font-mono text-xs" onClick={() => setInstalledOpen(true)}>
            <ListChecks className="size-4" />
            Installed items
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-sm shadow-sm backdrop-blur">
        <Badge variant="info" className="font-mono uppercase">
          Host OS: {hostOs || "unknown"}
        </Badge>
        <Badge variant="default" className="font-mono uppercase">
          OS-aware install flow
        </Badge>
        {totalRamBytes > 0 && totalRamBytes < 2 * 1024 * 1024 * 1024 ? (
          <Badge variant="warning" className="font-mono uppercase">
            Low RAM host: Docker-heavy apps may be slow
          </Badge>
        ) : null}
        <span className="text-muted-foreground">
          Native installs are only offered when the selected app supports this host; Docker remains the fallback for cross-platform apps.
        </span>
      </div>

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
                totalRamBytes={totalRamBytes}
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
                totalRamBytes={totalRamBytes}
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
                totalRamBytes={totalRamBytes}
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
                totalRamBytes={totalRamBytes}
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

      {installedOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setInstalledOpen(false)}
        >
          <Card className="max-h-[85vh] w-full max-w-lg overflow-hidden border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 py-3">
              <CardTitle className="text-base">Marketplace install history</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setInstalledOpen(false)}>
                Close
              </Button>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto p-4 text-sm">
              {installsQuery.isLoading ? (
                <div className="text-muted-foreground">Loading…</div>
              ) : installsQuery.isError ? (
                <div className="text-destructive">Could not load install history.</div>
              ) : (installsQuery.data ?? []).length === 0 ? (
                <p className="text-muted-foreground">
                  Nothing recorded yet. Running the install wizard (Docker command or native installer) adds an entry here automatically.
                </p>
              ) : (
                <ul className="space-y-3">
                  {(installsQuery.data ?? []).map((row) => (
                    <li key={row.id} className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-foreground">
                        <span>{row.app_slug}</span>
                        <Badge variant="default" className="uppercase">
                          {row.install_mode}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{row.status}</div>
                      <div className="mt-1 wrap-break-word font-mono text-[10px] text-muted-foreground/90 whitespace-pre-wrap">
                        {row.notes ? formatInstallerLog(row.notes) : "—"}
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground">{row.updated_at}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && (setSelected(null), setWizardOpen(false))}
        >
          <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {resolveMarketplaceIcon(selected) ? (
              <div className="h-48 w-full flex items-center justify-center bg-linear-to-b from-slate-100 via-slate-50/50 to-white dark:bg-linear-to-br dark:from-slate-900 dark:via-slate-600 dark:to-slate-800">
                <MarketplaceAppIcon app={selected} variant="hero" />
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
                <Badge variant="info" className="uppercase">Host: {hostOs || "unknown"}</Badge>
                <Badge variant={selected.supported_os.includes(hostOs) ? "success" : "warning"} className="uppercase">
                  {selected.supported_os.includes(hostOs) ? "Host supported" : "Docker recommended"}
                </Badge>
                <Badge variant="default" className="uppercase">
                  Suggested: {recommendedInstallMethod}
                </Badge>
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
                    <Button
                      variant={installMethod === "native" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setInstallMethod("native")}
                      disabled={!mapCatalogRuntimeToInstaller(selected)}
                    >
                      Native host install
                    </Button>
                    <div className="ml-auto text-xs text-muted-foreground">
                      {!mapCatalogRuntimeToInstaller(selected) ? (
                        <span className="text-destructive">Native installer not supported for this runtime.</span>
                      ) : selected.supported_os.includes(hostOs) ? (
                        `Native install is available on ${hostOs}.`
                      ) : (
                        `This host is not listed in supported OS targets, so Docker is the safe route.`
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background p-3 text-sm">
                    {wizardStep === 1 ? (
                      <p className="text-xs text-muted-foreground">Choose Docker or native above, then press Proceed.</p>
                    ) : null}
                    {wizardStep === 2 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-foreground">Configure ports and environment</div>
                        <label className="block text-[11px] text-muted-foreground">Host port (published to your machine)</label>
                        <Input
                          value={installHostPort}
                          onChange={(e) => setInstallHostPort(e.target.value)}
                          className="h-9 font-mono text-xs"
                          inputMode="numeric"
                        />
                        <label className="block text-[11px] text-muted-foreground">Environment (KEY=value per line)</label>
                        <textarea
                          className="min-h-24 w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
                          value={installEnvText}
                          onChange={(e) => setInstallEnvText(e.target.value)}
                        />
                      </div>
                    ) : null}
                    {wizardStep === 3 ? (
                      <div className="space-y-2">
                        <Button size="sm" variant="outline" disabled={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
                          {validateMutation.isPending ? "Validating…" : "Run validation"}
                        </Button>
                        <div className="min-h-16 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                          {validationSummary ?? "Run validation to check Docker or preview native installers."}
                        </div>
                      </div>
                    ) : null}
                    {wizardStep === 4 ? (
                      <div className="space-y-2">
                        <Button size="sm" disabled={installMutation.isPending} onClick={() => installMutation.mutate()}>
                          {installMutation.isPending
                            ? "Working…"
                            : installMethod === "docker"
                              ? "Generate docker run"
                              : "Run native installer"}
                        </Button>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {installMethod === "docker"
                            ? "Builds a docker run template from the catalog port mapping. Edit the image tag before running in production."
                            : "Runs the SkyPort host runtime installer when the catalog runtime maps to node, bun, deno, python, go, php, java, or pm2."}
                        </p>
                      </div>
                    ) : null}
                    {wizardStep === 5 ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Install log</div>
                        <div className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[10px] text-foreground/90">
                          {installFeedback.trim()
                            ? formatInstallerLog(installFeedback)
                            : validationSummary?.trim()
                              ? formatInstallerLog(validationSummary)
                              : "No output yet — run validation (step 3) and install/deploy (step 4), or finish to close."}
                        </div>
                        {installTriggered && (
                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="link"
                              className="h-6 p-0 text-xs text-primary"
                              onClick={() => {
                                setWizardOpen(false);
                                setInstalledOpen(true);
                              }}
                            >
                              <ListChecks className="mr-1 size-3" />
                              Check history
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null}
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
                <div className="flex gap-2">
                  {wizardOpen && hasInstallAccess ? (
                    <Button size="sm" onClick={advanceInstallFlow}>
                      {wizardStep < 5 ? "Proceed with install" : "Finish install plan"}
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => (setSelected(null), setWizardOpen(false))}>
                    Close
                  </Button>
                </div>
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
  totalRamBytes,
  onDetails,
  onInstall,
  canInstall,
  onTagSearch,
}: {
  app: MarketplaceApp;
  totalRamBytes: number;
  onDetails: () => void;
  onInstall: (method: "docker" | "native") => void;
  canInstall: boolean;
  onTagSearch: (value: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {resolveMarketplaceIcon(app) ? (
        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-linear-to-b from-slate-100 via-slate-50/50 to-white dark:bg-linear-to-br dark:from-slate-900 dark:via-slate-600 dark:to-slate-800">
          <div className="transition-transform duration-300 hover:scale-110">
            <MarketplaceAppIcon app={app} variant="card" />
          </div>

          {/* FIX 1: Made the shadow overlay light/transparent in light mode, and dark slate in dark mode */}
          <div className="absolute inset-0 bg-linear-to-t from-white/90 via-white/20 to-transparent dark:from-slate-950/80 dark:via-transparent dark:to-transparent" />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            {app.featured ? <Badge variant="success">Featured</Badge> : <span />}
            {app.trending ? <Badge variant="warning">Trending</Badge> : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <div>
              {/* FIX 2: Dynamic text color (Dark text for light mode, White text for dark mode) */}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{app.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-300">{app.category}</p>
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
          {totalRamBytes > 0 && parseMemoryToBytes(app.memory_requirements) > totalRamBytes ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-500">
              Higher than host RAM
            </span>
          ) : null}
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Ports:</span> {app.ports.join(", ") || "-"}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={onDetails}>
            Details
          </Button>
          <Button size="sm" className="font-mono text-xs" disabled={!canInstall} onClick={() => onInstall("docker")}>
            Install
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function parseMemoryToBytes(value: string) {
  const input = value.trim().toLowerCase();
  const numeric = Number.parseFloat(input);
  if (!Number.isFinite(numeric)) return 0;
  if (input.endsWith("gib") || input.endsWith("gb")) return numeric * 1024 * 1024 * 1024;
  if (input.endsWith("mib") || input.endsWith("mb")) return numeric * 1024 * 1024;
  if (input.endsWith("kib") || input.endsWith("kb")) return numeric * 1024;
  return numeric;
}


// REPLACE YOUR ENTIRE MarketplaceIconSpec + MarketplaceAppIcon + resolveMarketplaceIcon SECTION WITH THIS

type MarketplaceIconSpec =
  | { kind: "stack"; name: string }
  | { kind: "simple"; icon: { path: string; hex: string } }
  | { kind: "url"; src: string }
  | { kind: "generic"; label: string };

function MarketplaceAppIcon({
  app,
  variant,
}: {
  app: MarketplaceApp;
  variant: "card" | "hero";
}) {
  const icon = resolveMarketplaceIcon(app);

  const sizeClass =
    variant === "hero"
      ? "size-32"
      : "size-24 opacity-95";

  if (icon.kind === "stack") {
    return (
      <StackIcon
        name={icon.name as any}
        variant="light"
        className={`${sizeClass} drop-shadow-xl`}
      />
    );
  }

  if (icon.kind === "simple") {
    return (
      <svg
        role="img"
        aria-label={app.name}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className={`${sizeClass} drop-shadow-xl`}
        style={{
          color: `#${icon.icon.hex}`,
        }}
        fill="currentColor"
      >
        <path d={icon.icon.path} />
      </svg>
    );
  }

  if (icon.kind === "url") {
    return (
      <img
        src={icon.src}
        alt={app.name}
        loading="lazy"
        draggable={false}
        className={`${sizeClass} object-contain`}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={`${variant === "hero"
        ? "size-32 text-4xl"
        : "size-24 text-3xl"
        } flex items-center justify-center rounded-full border border-white/10 bg-white/5 font-semibold text-white/90`}
    >
      {icon.label}
    </div>
  );
}

function resolveMarketplaceIcon(
  app: MarketplaceApp,
): MarketplaceIconSpec {
  const candidates = [
    app.slug,
    app.name,
    app.runtime,
    ...(app.tags ?? []),
  ]
    .map(normalizeIconKey)
    .filter(Boolean);

  // SIMPLE ICONS FIRST
  for (const key of candidates) {
    const icon = SIMPLE_ICON_MAP[key];

    if (icon?.path) {
      return {
        kind: "simple",
        icon,
      };
    }
  }

  // CUSTOM URL ICONS SECOND
  for (const key of candidates) {
    const src = APP_ICON_URL_MAP[key];

    if (src) {
      return {
        kind: "url",
        src,
      };
    }
  }

  // TECH STACK ICONS LAST
  for (const key of candidates) {
    const stackName = TECH_STACK_ICON_MAP[key];

    if (stackName) {
      return {
        kind: "stack",
        name: stackName,
      };
    }
  }

  // FALLBACK
  return {
    kind: "generic",
    label: app.name.slice(0, 2).toUpperCase(),
  };
}

function normalizeIconKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_+.]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// First preference: tech-stack-icons names that are known to render well.
const TECH_STACK_ICON_MAP: Record<string, string> = {
  "postgresql": "postgresql",
  "postgres": "postgresql",
  "mysql": "mysql",
  "mariadb": "mariadb",
  "mongodb": "mongodb",
  "redis": "redis",
  "redis-stack": "redis",
  "valkey": "redis",
  "influxdb": "influxdb",
  "node-runtime": "nodejs2",
  "node": "nodejs2",
  "nodejs": "nodejs2",
  "node-js": "nodejs2",
  "bun-runtime": "bunjs",
  "bun": "bunjs",
  "bunjs": "bunjs",
  "python-runtime": "python",
  "python": "python",
  "go-runtime": "go",
  "go": "go",
  "golang": "go",
  "php-runtime": "php",
  "php": "php",
  "java-runtime": "java",
  "java": "java",
  "nuxt": "nuxtjs",
  "astro": "astro",
  "vite": "vitejs",
  "vitejs": "vitejs",
  "react-static": "react",
  "react": "react",
  "vue-static": "vuejs",
  "vue": "vue",
  "vuejs": "vuejs",
  "wordpress": "wordpress",
  "appwrite": "appwrite",
  "grafana": "grafana",
  "prometheus": "prometheus",
  "docker-registry": "docker",
  "docker": "docker",
  "minio": "minio",
  "portainer-agent": "portainer",
  "jenkins": "jenkins",
  "rabbitmq": "rabbitmq",
  "kafka": "kafka",
  "nginx": "nginx",
  "keycloak": "keycloak",
  "plausible": "plausible",
  "umami": "umami",
  "vscode-server": "vscode",
  "code-server": "vscode",
  "rust": "rust",
  "dotnet": "dotnet",
  "ruby": "ruby",
  "angular": "angular",
  "kubernetes": "kubernetes",
  "k8s": "kubernetes",
  "terraform": "terraform",
  "gitlab": "gitlab",
  "github": "github",
};

// Second preference: colored simple-icons fallback.
// REPLACE YOUR ENTIRE SIMPLE_ICON_MAP WITH THIS

const SIMPLE_ICON_MAP: Record<
  string,
  { path: string; hex: string }
> = {
  cassandra: siApachecassandra,
  directus: siDirectus,
  strapi: siStrapi,
  ghost: siGhost,
  supabase: siSupabase,
  meilisearch: siMeilisearch,
  elasticsearch: siElasticsearch,
  opensearch: siOpensearch,
  forgejo: siForgejo,
  temporal: siTemporal,
  "apache-kafka": siApachekafka,
  kafka: siApachekafka,
  authentik: siAuthentik,
  vaultwarden: siBitwarden,
  "uptime-kuma": siUptimekuma,
  n8n: siN8n,
  pocketbase: siPocketbase,
  nginx: siNginx,
  nats: siNatsdotio,
  "c-plus-plus": siCplusplus,
  c: siC,
  elixir: siElixir,
  erlang: siErlang,
  jupyterlab: siJupyter,
  jupyter: siJupyter,
  gitea: siGitea,
};

// Third preference: paste image URLs here for apps with no package icon.
// REPLACE YOUR ENTIRE APP_ICON_URL_MAP WITH THIS

const APP_ICON_URL_MAP: Record<string, string> = {
  "coolify-agent": "https://docs.hetzner.com/static/1dbc8e5220638f7193ef9f5a24c2eb5b/0b533/coolify-logo.png",
  coolify: "https://docs.hetzner.com/static/1dbc8e5220638f7193ef9f5a24c2eb5b/0b533/coolify-logo.png",
  victoriametrics: "https://raw.githubusercontent.com/alex-red/unraid-ca-templates/master/templates/images/victoria-metrics-logo.png",
  "redis-stack": "https://redis.io/wp-content/uploads/2024/04/Logotype.svg",
  redis: "https://redis.io/wp-content/uploads/2024/04/Logotype.svg",
  "code-server": "https://dashboard.snapcraft.io/site_media/appmedia/2021/09/code-server.png",
  "docker-registry": "https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png",
  docker: "https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png",
  portainer: "https://www.portainer.io/hubfs/Brand%20Assets/Logos/PNG/portainer-logo-mark-blue.png",
  "portainer-agent": "https://repository-images.githubusercontent.com/646947691/fb16b861-479d-4bfc-b8b1-185a1e7be212",
  appwrite: "https://privacyshortlist.com/products/appwrite.svg",
  minio: "https://artifacthub.io/image/aec2a822-2a3f-41a6-8a71-57c5d75d011e@3x",
  keycloak: "https://www.e-time.it/wp-content/uploads/2022/03/Keycloak_logo-300x200.webp",
  jenkins: "https://www.jenkins.io/images/logos/jenkins/jenkins.svg",
  gitea: "https://avatars.githubusercontent.com/u/12724356?s=280&v=4",
  rabbitmq: "https://www.rabbitmq.com/img/rabbitmq-logo.svg",
  kafka: "https://cdn.worldvectorlogo.com/logos/apache-kafka.svg",
  n8n: "https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png",
  ollama: "https://www.techspot.com/images2/downloads/topdownload/2025/06/2025-06-22-ts3_thumbs-e23.png",
  influxdb: "https://www.niagaramarketplace.com/media/catalog/product/cache/8ec2f9f1aafbe7f04b9376f56dd1d327/m/a/marketplace_icons_13_.png",
  typesense: "https://logowik.com/content/uploads/images/typesense1721419237.logowik.com.webp",
  appsmith: "https://avatars.githubusercontent.com/u/67620218?s=280&v=4",
  budibase: "https://avatars.githubusercontent.com/u/45009727?s=200&v=4",
  deno: "https://raw.githubusercontent.com/denoland/vscode_deno/main/deno.png",
  nextjs: "https://marcbruederlin.gallerycdn.vsassets.io/extensions/marcbruederlin/next-icons/0.1.0/1723747598319/Microsoft.VisualStudio.Services.Icons.Default",
  umami: "https://play-lh.googleusercontent.com/-Ac9NY3nlojZ7D4Iq0YkCroRoOE4K15EKpuuj0sGjzOtwodXAsJaeuEcyrLX4H6g7f_DQi4LuYxZIjQLPN9o2B8=w240-h480-rw"
};

function MarketplaceShelf({
  title,
  icon,
  apps,
  totalRamBytes,
  onInstall,
  onDetails,
  canInstall,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  apps: MarketplaceApp[];
  totalRamBytes: number;
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
              totalRamBytes={totalRamBytes}
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

function mapCatalogRuntimeToInstaller(app: MarketplaceApp): string | null {
  const r = app.runtime.toLowerCase().trim();
  if (["node", "bun", "python", "go", "php", "java", "pm2", "deno"].includes(r)) return r;
  return null;
}

const DOCKER_IMAGE_BY_SLUG: Record<string, string> = {
  postgresql: "postgres:16-alpine",
  mysql: "mysql:8",
  mariadb: "mariadb:11",
  mongodb: "mongo:7",
  redis: "redis:7-alpine",
  cassandra: "cassandra:5",
  "node-runtime": "node:20-bookworm-slim",
  "bun-runtime": "oven/bun:1",
  "deno-runtime": "denoland/deno:distroless",
  "python-runtime": "python:3.12-slim",
  "go-runtime": "golang:1.22-alpine",
  "php-runtime": "php:8.3-cli",
  "java-runtime": "eclipse-temurin:21-jre",
};

function buildDockerRunCommand(app: MarketplaceApp, hostPort: string, envText: string): string {
  const internal = app.ports[0] ?? 8080;
  const hp = (hostPort || String(internal)).trim();
  const slug = app.slug.toLowerCase();
  const image = DOCKER_IMAGE_BY_SLUG[slug] ?? `docker.io/library/${app.runtime}:latest`;
  const safeName = `skyport-${slug}`.replace(/[^a-z0-9-]/g, "-").slice(0, 48);
  const envFlags = envText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("=");
      if (i <= 0) return "";
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (!k) return "";
      return `-e ${k}=${v}`;
    })
    .filter(Boolean)
    .join(" ");
  const envPart = envFlags ? ` ${envFlags}` : "";
  return `docker run -d --name ${safeName} --restart unless-stopped -p ${hp}:${internal}${envPart} ${image}`;
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

function detectHostOs(info: Record<string, unknown> | undefined): string {
  const raw = `${info?.platform ?? info?.os ?? info?.name ?? info?.hostname ?? ""}`.toLowerCase();
  if (raw.includes("win")) return "windows";
  if (raw.includes("darwin") || raw.includes("mac")) return "macos";
  if (raw.includes("linux")) return "linux";
  return raw || "unknown";
}

function formatInstallerLog(text: string): string {
  try {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      const nativeBlockMarker = "--- Native install ---\n";
      if (trimmed.includes(nativeBlockMarker)) {
        const parts = trimmed.split(nativeBlockMarker);
        const jsonPart = parts[parts.length - 1].trim();
        return parts[0] + nativeBlockMarker + formatJsonOrText(jsonPart);
      }
      return text;
    }
    return formatJsonOrText(trimmed);
  } catch {
    return text;
  }
}

function formatJsonOrText(input: string): string {
  try {
    const data = JSON.parse(input);
    if (data && typeof data === "object") {
      if (data.present && data.skipped_install) {
        return `✅ SUCCESS: Runtime "${data.result?.runtime || "unknown"}" is already installed and available on your system PATH.\n\nVerify via: ${data.found_in || "system path"}\n\nNo further action needed.`;
      }
      if (data.execute === true && data.result?.installed === true) {
        const cmds = (data.result?.commands ?? []).join("\n");
        return `✅ SUCCESS: Runtime "${data.result?.runtime}" was successfully installed.\n\nCommands run:\n${cmds}\n\nOutput:\n${data.result?.output || "Done."}`;
      }
      if (data.message) {
        return data.message + (data.result?.output ? `\n\nDetails:\n${data.result.output}` : "");
      }
      return JSON.stringify(data, null, 2);
    }
    return input;
  } catch {
    return input;
  }
}
