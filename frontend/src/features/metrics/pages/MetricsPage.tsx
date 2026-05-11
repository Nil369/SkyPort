import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWebSocket } from "@/services/ws/useWebSocket";
import { useAuthStore } from "@/stores/authStore";

type HostSnapshot = {
  collected_at: string;
  cpu: { usage_percent: number };
  memory: { used_percent: number };
  disk: { used_percent: number };
};

type Point = { t: string; v: number };

function pushPoint(list: Point[], p: Point, limit = 80) {
  const next = [...list, p];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function MetricsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { hub, getStatus } = useWebSocket();
  const [cpu, setCpu] = React.useState<Point[]>([]);
  const [ram, setRam] = React.useState<Point[]>([]);
  const [disk, setDisk] = React.useState<Point[]>([]);

  React.useEffect(() => {
    if (!token) return;
    hub.connect("metrics", "/metrics", { token, parseJson: true });
    return hub.subscribe<HostSnapshot>("metrics", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if ((msg as any).error) return;
      const m = msg as HostSnapshot;
      const t = new Date(m.collected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setCpu((s) => pushPoint(s, { t, v: m.cpu.usage_percent }));
      setRam((s) => pushPoint(s, { t, v: m.memory.used_percent }));
      setDisk((s) => pushPoint(s, { t, v: m.disk.used_percent }));
    });
  }, [hub, token]);

  const ws = getStatus("metrics");

  return (
    <PageShell>
      <PageHeader title="Metrics" subtitle={`Realtime metrics stream status: ${ws}`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MetricCard title="CPU Usage" color="var(--chart-1)" data={cpu} status={ws} />
        <MetricCard title="RAM Usage" color="var(--chart-2)" data={ram} status={ws} />
        <MetricCard title="Disk Usage" color="var(--chart-3)" data={disk} status={ws} />
      </div>
    </PageShell>
  );
}

function MetricCard({ title, color, data, status }: { title: string; color: string; data: Point[]; status: string }) {
  const latest = data.at(-1)?.v;
  const gid = React.useId();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Badge variant={status === "connected" ? "success" : "warning"}>{status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="font-mono text-3xl">{latest !== undefined ? `${latest.toFixed(0)}%` : "--"}</div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -10, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.03} />
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
              <Area type="monotone" dataKey="v" stroke={color} fill={`url(#${gid})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
