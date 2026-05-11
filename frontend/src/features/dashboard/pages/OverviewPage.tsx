import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Active deployments, docker status, and recent logs will appear here.
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
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
