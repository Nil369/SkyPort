import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cpu, ExternalLink, HardDrive, Play, RotateCcw, ScrollText, Search, Square, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseEnvTextSimple } from "@/lib/envUtils";
import { platformApi, type Pm2WsSnapshot } from "@/features/platform/api";
import { resolvedStartCommand, withNodeHintsIfApplicable } from "@/lib/runtimeHints";
import { useWebSocket } from "@/services/ws/useWebSocket";
import { useAuthStore } from "@/stores/authStore";

const pageSize = 12;

export function ProcessManagerPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const { hub } = useWebSocket();

  const [projectId, setProjectId] = React.useState("");
  const [startCmd, setStartCmd] = React.useState("");
  const [workingDir, setWorkingDir] = React.useState("");
  const [port, setPort] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const pm2AutofillKey = React.useRef("");
  const [page, setPage] = React.useState(1);
  const [installNote, setInstallNote] = React.useState<string | null>(null);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [logsOpen, setLogsOpen] = React.useState(false);
  const [logsName, setLogsName] = React.useState("");
  const [logsBody, setLogsBody] = React.useState("");
  const [logsLoading, setLogsLoading] = React.useState(false);

  const pm2Host = useQuery({
    queryKey: ["pm2-host-status"],
    queryFn: () => platformApi.pm2HostStatus(),
  });
  const present = Boolean(pm2Host.data?.installed);
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const selectedProject = React.useMemo(
    () => projects.data?.find((project) => String(project.id) === projectId) ?? null,
    [projectId, projects.data]
  );
  const projectRuntime = useQuery({
    queryKey: ["runtime-detect", selectedProject?.path],
    queryFn: () => platformApi.detectProjectRuntime(selectedProject?.path ?? ""),
    enabled: Boolean(selectedProject?.path),
  });

  React.useEffect(() => {
    pm2AutofillKey.current = "";
  }, [projectId]);

  React.useEffect(() => {
    if (!selectedProject?.path) return;
    if (projectRuntime.isLoading) return;
    if (pm2AutofillKey.current === projectId) return;

    if (projectRuntime.isError) {
      setStartCmd((s) => (s.trim() ? s : "npm start"));
      setPort((p) => (p.trim() ? p : "3000"));
      pm2AutofillKey.current = projectId;
      return;
    }

    if (!projectRuntime.data) return;

    const detected = projectRuntime.data;
    const hinted = withNodeHintsIfApplicable(detected);
    const runtime = String(hinted.runtime ?? "").toLowerCase();
    if (runtime !== "node" && runtime !== "bun" && runtime !== "python" && runtime !== "go" && runtime !== "php" && runtime !== "java") {
      pm2AutofillKey.current = projectId;
      return;
    }

    const start = resolvedStartCommand(detected);
    if (start) {
      setStartCmd(start);
    }
    if (detected.detected_port) {
      setPort(String(detected.detected_port));
    }
    if (detected.working_directory) {
      setWorkingDir(detected.working_directory);
    }

    pm2AutofillKey.current = projectId;
  }, [projectId, selectedProject?.path, projectRuntime.data, projectRuntime.isLoading, projectRuntime.isError]);

  const pm2List = useQuery({
    queryKey: ["pm2-list"],
    queryFn: () => platformApi.listPm2Processes(),
    enabled: present,
  });

  React.useEffect(() => {
    if (!token || !present) return;
    hub.connect("pm2", "/pm2", { token, parseJson: true });
    const off = hub.subscribe<Pm2WsSnapshot>("pm2", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if ((msg as { error?: unknown }).error) return;
      if (msg.type === "pm2_snapshot" && Array.isArray(msg.processes)) {
        qc.setQueryData(["pm2-list"], { processes: msg.processes });
        if (msg.events?.length) {
          const crash = msg.events.find((e) => e.kind === "crash");
          if (crash) {
            toast.error(`${crash.name}: ${crash.message ?? "process state changed"}`);
          }
        }
      }
    });
    return () => {
      off();
      hub.close("pm2");
    };
  }, [hub, token, present, qc]);

  const processes = pm2List.data?.processes ?? [];
  const needle = search.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    let rows = processes;
    if (needle) {
      rows = processes.filter((p) => {
        const ports = (p.ports ?? []).join(" ");
        const blob = [
          p.name,
          p.status,
          p.runtime_type,
          p.framework,
          p.group_key,
          p.script,
          String(p.pid),
          String(p.pm_id),
          ports,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      });
    }
    return [...rows].sort((a, b) => {
      const g = (a.group_key || "").localeCompare(b.group_key || "");
      if (g !== 0) return g;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [processes, needle]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pm2Install = useMutation({
    mutationFn: () => platformApi.runtimeInstall("pm2", true),
    onSuccess: () => {
      setInstallError(null);
      setInstallNote(null);
      toast.success("PM2 install started");
      pm2Host.refetch();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? "PM2 install failed";
      setInstallError(msg);
      toast.error("PM2 install failed. See details below.");
    },
  });

  const pm2Action = useMutation({
    mutationFn: ({ name, action }: { name: string; action: "start" | "stop" | "restart" | "delete" }) =>
      platformApi.pm2Action(name, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm2-list"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "PM2 action failed"),
  });

  const pm2Deploy = useMutation({
    mutationFn: platformApi.createDeployment,
    onSuccess: () => {
      toast.success("PM2 deployment started");
      setProjectId("");
      setStartCmd("");
      setWorkingDir("");
      setPort("");
      setEnvText("");
      pm2AutofillKey.current = "";
      qc.invalidateQueries({ queryKey: ["deployments"] });
      qc.invalidateQueries({ queryKey: ["pm2-list"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Failed to deploy via PM2"),
  });

  async function openLogs(_id: string | number, displayName: string) {
    setLogsName(displayName);
    setLogsOpen(true);
    setLogsLoading(true);
    setLogsBody("");
    try {
      // Use name for logs as it's often more stable for tailing on Windows
      const res = await platformApi.pm2Logs(displayName, 250);
      setLogsBody(res.log || "(empty)");
    } catch (e: any) {
      setLogsBody(e?.response?.data?.error?.message ?? "Failed to load logs");
    } finally {
      setLogsLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Process Manager"
        subtitle="Native host PM2 — realtime WebSocket sync (not containerized)"
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/30">
          <CardTitle className="font-mono text-base tracking-tight">PM2 runtime</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
          <Badge variant={present ? "success" : "warning"}>{present ? "PM2 on host PATH" : "PM2 not detected"}</Badge>
          {pm2Host.data?.binary ? <Badge variant="info">{pm2Host.data.binary}</Badge> : null}
          <Button size="sm" variant="outline" onClick={() => pm2Host.refetch()}>
            Refresh status
          </Button>
          <Button size="sm" onClick={() => pm2Install.mutate()}>
            Install PM2
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open("https://pm2.keymetrics.io/", "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
            PM2 docs
          </Button>
        </CardContent>
        {installNote || installError ? (
          <CardContent className="pt-0">
            {installNote ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">{installNote}</div>
            ) : null}
            {installError ? (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">{installError}</div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/30">
          <CardTitle className="font-mono text-base tracking-tight">Deploy via PM2 (host)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={projectId}
            onChange={(e) => {
              const nextId = e.target.value;
              setProjectId(nextId);
              pm2AutofillKey.current = "";
              setStartCmd("");
              setWorkingDir("");
              setPort("");
              if (!nextId) {
                setEnvText("");
              }
            }}
          >
            <option value="">Select project</option>
            {(projects.data ?? []).map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Input placeholder="Start command" value={startCmd} onChange={(e) => setStartCmd(e.target.value)} />
          <Input placeholder="Working directory (optional)" value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} />
          <Input placeholder="Port (optional)" value={port} onChange={(e) => setPort(e.target.value)} />
          <textarea
            className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm sm:col-span-2 lg:col-span-4"
            placeholder="Environment variables (KEY=VALUE per line)"
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
          />
          {projectRuntime.data ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground lg:col-span-4">
              Auto-detected {projectRuntime.data.runtime} runtime
              {projectRuntime.data.framework ? ` · ${projectRuntime.data.framework}` : ""}
              {projectRuntime.data.package_manager ? ` · ${projectRuntime.data.package_manager}` : ""}
              {projectRuntime.data.detected_port ? ` · port ${projectRuntime.data.detected_port}` : ""}
              {projectRuntime.data.start_command ? ` · ${projectRuntime.data.start_command}` : ""}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground lg:col-span-4">
            SkyPort runs PM2 on the <span className="font-medium text-foreground">host OS</span>, separate from Docker deployments. Processes you start in a terminal with{" "}
            <span className="font-mono">pm2 start …</span> appear automatically in the table below.
          </p>
          <Button
            onClick={() =>
              pm2Deploy.mutate({
                project_id: Number(projectId),
                auto_start: true,
                strategy: "pm2",
                start_cmd: startCmd.trim() || undefined,
                env: parseEnvTextSimple(envText),
                working_directory: workingDir.trim() || undefined,
                port: port ? Number(port) : undefined,
              })
            }
            disabled={!projectId || pm2Deploy.isPending}
          >
            Deploy with PM2
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-mono text-base tracking-tight">Host processes</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 font-mono text-xs"
              placeholder="Filter by name, status, runtime, PID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/20 hover:bg-muted/20">
                <TableHead className="w-[200px]">Application</TableHead>
                <TableHead className="w-[120px]">Environment</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[180px]">Resources</TableHead>
                <TableHead className="w-[100px]">Network</TableHead>
                <TableHead className="w-[100px] text-right">Uptime</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => {
                const ports = p.ports?.length ? p.ports : p.env_port ? [p.env_port] : [];
                const portStr = ports.length ? ports.join(", ") : "—";
                const firstPort = ports[0] ?? 0;
                // On Windows, if we are using PM2, we should NOT resolve npm/yarn/pnpm to their absolute .cmd paths
                // because PM2 will try to run them via Node.js, leading to SyntaxErrors.
                const canLaunch = p.status === "online" && firstPort > 0;
                return (
                  <TableRow key={`${p.name}-${p.pm_id}`} className="group border-border/50 transition-colors hover:bg-muted/5">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">{p.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground opacity-60">#{p.pid || "—"}</span>
                        </div>
                        <div className="max-w-[180px] truncate font-mono text-[10px] text-muted-foreground/70" title={p.cwd}>
                          {p.cwd || "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="info" className="h-4 border-border/60 bg-muted/40 px-1 text-[9px] uppercase tracking-wider">
                            {p.runtime_type || "node"}
                          </Badge>
                          {p.framework && (
                            <Badge variant="info" className="h-4 px-1 text-[9px] uppercase tracking-wider">
                              {p.framework}
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-[9px] text-muted-foreground/60">{p.group_key || "default"}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StatusPill status={p.status} />
                        <div className="font-mono text-[9px] text-muted-foreground/60">{p.restarts ?? 0} restarts</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2.5">
                        <MicroBar value={p.cpu} max={100} icon={<Cpu className="h-3 w-3 text-muted-foreground/70" />} suffix="%" />
                        <MicroBar
                          value={p.memory_bytes}
                          max={512 * 1024 * 1024}
                          icon={<HardDrive className="h-3 w-3 text-muted-foreground/70" />}
                          formatValue={(v) => formatBytes(v)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 font-mono text-[10px]">
                        <span className="text-foreground/80">{portStr}</span>
                        {canLaunch && (
                          <a
                            href={`http://localhost:${firstPort}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-primary hover:underline"
                          >
                            Launch <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-muted-foreground">{formatUptime(p.uptime_sec)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="View Logs"
                          onClick={() => openLogs(p.pm_id, p.name)}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-success hover:bg-success/10 hover:text-success"
                          title="Start"
                          disabled={p.status === "online"}
                          onClick={() => pm2Action.mutate({ name: p.name, action: "start" })}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-warning hover:bg-warning/10 hover:text-warning"
                          title="Stop"
                          disabled={p.status !== "online"}
                          onClick={() => pm2Action.mutate({ name: p.name, action: "stop" })}
                        >
                          <Square className="h-3 w-3 fill-current" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-info hover:bg-info/10 hover:text-info"
                          title="Restart"
                          onClick={() => pm2Action.mutate({ name: p.name, action: "restart" })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                          onClick={() => pm2Action.mutate({ name: p.name, action: "delete" })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Activity className="h-8 w-8 opacity-40" />
                      <span>{present ? "No processes match this filter." : "Install PM2 on the host to manage processes."}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
         {filtered.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/40 px-6 py-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-foreground/80">
                Page {page} of {totalPages}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} processes
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 font-mono text-[11px] uppercase tracking-tight"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <div className="flex h-8 items-center gap-1 px-2 font-mono text-[11px] font-bold">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      page === p ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 font-mono text-[11px] uppercase tracking-tight"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {logsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border/80 bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div className="font-mono text-sm">
                Logs — <span className="text-primary">{logsName}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setLogsOpen(false)} aria-label="Close logs">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-50 flex-1 overflow-auto p-4">
              {logsLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">{logsBody}</pre>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let variant: React.ComponentProps<typeof Badge>["variant"] = "info";
  if (s === "online") variant = "success";
  else if (s === "stopped" || s === "stopping") variant = "warning";
  else if (s === "errored") variant = "danger";
  return (
    <Badge variant={variant} className="min-w-18 justify-center font-mono text-[10px] uppercase tracking-wide">
      {s || "—"}
    </Badge>
  );
}

function MicroBar({
  value,
  max,
  icon,
  suffix,
  formatValue,
}: {
  value: number;
  max: number;
  icon?: React.ReactNode;
  suffix?: string;
  formatValue?: (v: number) => string;
}) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const label = formatValue ? formatValue(value) : `${value.toFixed(1)}${suffix ?? ""}`;
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex min-w-18 flex-1 flex-col gap-0.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary/80 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatUptime(sec: number) {
  if (sec == null || sec <= 0) return "—";
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${rs}s`;
  return `${rs}s`;
}
