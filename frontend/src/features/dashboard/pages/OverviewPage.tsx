import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { platformApi } from "@/features/platform/api";
import { useWebSocket } from "@/services/ws/useWebSocket";
import { useAuthStore } from "@/stores/authStore";

export type HostSnapshot = {
  schema: string;
  collected_at: string;
  host: { hostname: string; uptime_seconds: number; uptime_human?: string };
  cpu: { usage_percent: number; cores_logical: number };
  memory: { used_percent: number; used_human?: string; total_human?: string };
  disk: { used_percent: number; used_human?: string; total_human?: string };
};

type Point = { t: string; v: number };

function pushPoint(list: Point[], p: Point, limit = 48) {
  const next = [...list, p];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function OverviewPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { hub, getStatus } = useWebSocket();

  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects, staleTime: 15_000 });
  const docker = useQuery({ queryKey: ["docker-status"], queryFn: platformApi.dockerStatus, staleTime: 30_000 });

  const [snap, setSnap] = React.useState<HostSnapshot | null>(null);
  const [cpu, setCpu] = React.useState<Point[]>([]);
  const [ram, setRam] = React.useState<Point[]>([]);
  const [disk, setDisk] = React.useState<Point[]>([]);

  React.useEffect(() => {
    if (!token) return;
    // Ensure metrics socket is connected (provider also warms it).
    hub.connect("metrics", "/metrics", { token, parseJson: true });

    return hub.subscribe<HostSnapshot>("metrics", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if ((msg as any).error) return;
      const m = msg as HostSnapshot;
      setSnap(m);
      const t = new Date(m.collected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setCpu((s) => pushPoint(s, { t, v: m.cpu.usage_percent }));
      setRam((s) => pushPoint(s, { t, v: m.memory.used_percent }));
      setDisk((s) => pushPoint(s, { t, v: m.disk.used_percent }));
    });
  }, [hub, token]);

  const ws = getStatus("metrics");

  return (
    <PageShell>
      <PageHeader
        title="Overview"
        subtitle="Realtime host metrics and platform activity"
        right={<div className="text-xs text-muted-foreground">WS: {ws}</div>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>CPU usage</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap ? (
              <Skeleton className="h-35" />
            ) : (
              <MetricChart data={cpu} color="var(--chart-1)" value={`${snap.cpu.usage_percent.toFixed(0)}%`} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>RAM usage</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap ? (
              <Skeleton className="h-35" />
            ) : (
              <MetricChart
                data={ram}
                color="var(--chart-2)"
                value={`${snap.memory.used_percent.toFixed(0)}%`}
                meta={`${snap.memory.used_human ?? ""} / ${snap.memory.total_human ?? ""}`.trim()}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Disk usage</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap ? (
              <Skeleton className="h-35" />
            ) : (
              <MetricChart
                data={disk}
                color="var(--chart-3)"
                value={`${snap.disk.used_percent.toFixed(0)}%`}
                meta={`${snap.disk.used_human ?? ""} / ${snap.disk.total_human ?? ""}`.trim()}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap ? (
              <Skeleton className="h-35" />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <KV label="Hostname" value={snap.host.hostname} />
                <KV label="Uptime" value={snap.host.uptime_human ?? `${snap.host.uptime_seconds}s`} mono />
                <KV label="Logical cores" value={String(snap.cpu.cores_logical)} mono />
                <KV label="Schema" value={snap.schema} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>Platform activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <PlatformActivitySection
              title="Projects"
              loading={projects.isLoading}
              empty="No projects yet. Create one under Projects."
              action={<Link className="text-xs font-medium text-primary hover:underline" to="/projects">Open projects</Link>}
            >
              {(projects.data ?? []).length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {(projects.data ?? [])
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="truncate font-mono text-foreground/90">{p.name}</span>
                        <span className="shrink-0 text-[10px] uppercase text-muted-foreground/80">#{p.id}</span>
                      </li>
                    ))}
                  {(projects.data ?? []).length > 5 ? (
                    <li className="text-[11px] text-muted-foreground/80">+{(projects.data ?? []).length - 5} more</li>
                  ) : null}
                </ul>
              ) : null}
            </PlatformActivitySection>
            
            <PlatformActivitySection
              title="Docker host"
              loading={docker.isLoading}
              empty="Docker status unavailable."
              action={<Link className="text-xs font-medium text-primary hover:underline" to="/docker">Docker</Link>}
            >
              {docker.data ? (
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Engine</span>
                    <Badge variant={docker.data.installed ? "success" : "warning"} className="font-mono text-[10px]">
                      {docker.data.installed ? "installed" : "not installed"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Daemon</span>
                    <Badge variant={docker.data.daemon_running ? "success" : "default"} className="font-mono text-[10px]">
                      {docker.data.daemon_running ? "running" : "stopped"}
                    </Badge>
                  </div>
                  {docker.data.version ? (
                    <div className="wrap-break-word font-mono text-[10px] text-foreground/80">{docker.data.version}</div>
                  ) : null}
                </div>
              ) : null}
            </PlatformActivitySection>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Deployment logs stream from each deployment card (View logs). Process output is available under Process Manager.
            </p>
          </CardContent>
        </Card>

        <section className="lg:col-span-12">
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_55%),linear-gradient(135deg,rgba(15,23,42,1),rgba(17,24,39,0.85))] p-6 text-white">
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[conic-gradient(at_top_left,#facc15,#22c55e,#60a5fa,#a855f7,#facc15)] opacity-20 blur-2xl" />
            <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,#38bdf8,transparent_65%)] opacity-25" />
            <div className="relative z-10 grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
                  Launch partner
                </div>
                <h3 className="text-3xl font-semibold leading-tight">
                Build modern developer infrastructure with {""}
                  <span className="font-bold text-blue-400">Akash Halder Technologia!</span>
                </h3>
                <p className="text-sm text-white/70">
                From developer platforms to full-stack SaaS systems — designed for performance, reliability, and rapid iteration.
                </p>
              </div>
              <div className="flex items-center justify-start lg:justify-end">
                <a
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:-translate-y-px"
                  href="https://www.akashhalder.in/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit akashhalder.in
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function PlatformActivitySection({
  title,
  loading,
  empty,
  action,
  children,
}: {
  title: string;
  loading: boolean;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        {action}
      </div>
      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : children ? (
        children
      ) : (
        <div className="text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-sm" : "text-sm"}>{value}</div>
    </div>
  );
}

function MetricChart({
  data,
  color,
  value,
  meta,
}: {
  data: Point[];
  color: string;
  value: string;
  meta?: string;
}) {
  const gradientId = React.useId();

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div className="font-mono text-2xl leading-none">{value}</div>
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      <div className="h-35">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -10, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
