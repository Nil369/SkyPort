import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cpu, HardDrive, MemoryStick, Activity } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/services/ws/useWebSocket";
import { useAuthStore } from "@/stores/authStore";

type HostSnapshot = {
  schema: string;
  collected_at: string;
  host: { hostname: string; uptime_seconds: number; uptime_human?: string };
  cpu: { usage_percent: number; cores_logical: number };
  memory: { used_percent: number };
  disk: { used_percent: number };
};

type Point = { t: string; v: number };

function pushPoint(list: Point[], p: Point, limit = 60) {
  const next = [...list, p];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

type Tab = "cpu" | "memory" | "disk";

const METRIC_COLORS = {
  cpu: {
    stroke: "#3b82f6", // Blue-500
    fill: "#3b82f633",
  },
  memory: {
    stroke: "#f97316", // Orange-500
    fill: "#f9731633",
  },
  disk: {
    stroke: "#22c55e", // Green-500
    fill: "#22c55e33",
  },
};

export function MetricsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { hub, getStatus } = useWebSocket();
  const [snap, setSnap] = React.useState<HostSnapshot | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("cpu");

  const [cpuHistory, setCpuHistory] = React.useState<Point[]>([]);
  const [memoryHistory, setMemoryHistory] = React.useState<Point[]>([]);
  const [diskHistory, setDiskHistory] = React.useState<Point[]>([]);

  React.useEffect(() => {
    if (!token) return;
    hub.connect("metrics", "/metrics", { token, parseJson: true });
    return hub.subscribe<HostSnapshot>("metrics", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if ((msg as { error?: unknown }).error) return;
      const m = msg as HostSnapshot;
      setSnap(m);
      const t = new Date(m.collected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setCpuHistory((s) => pushPoint(s, { t, v: m.cpu.usage_percent }));
      setMemoryHistory((s) => pushPoint(s, { t, v: m.memory.used_percent }));
      setDiskHistory((s) => pushPoint(s, { t, v: m.disk.used_percent }));
    });
  }, [hub, token]);

  const status = getStatus("metrics");

  const activeData = activeTab === "cpu" ? cpuHistory : activeTab === "memory" ? memoryHistory : diskHistory;
  const activeLabel = activeTab === "cpu" ? "CPU" : activeTab === "memory" ? "Memory" : "Disk 0";
  const activeSubtitle = activeTab === "cpu" ? "% Utilization over 60 seconds" : activeTab === "memory" ? "Memory usage" : "Active time";
  const activeColor = METRIC_COLORS[activeTab];

  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
          </div>
          <Badge variant={status === "connected" ? "success" : "warning"} className="animate-pulse capitalize">
            {status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm lg:grid-cols-12">
          {/* Sidebar */}
          <div className="col-span-1 border-r bg-muted/30 lg:col-span-3">
            <div className="flex flex-col">
              <MetricSidebarItem
                icon={<Cpu className="h-4 w-4" />}
                label="CPU"
                value={`${snap?.cpu.usage_percent.toFixed(0) ?? 0}%`}
                subValue={snap ? `${snap.cpu.cores_logical} Logical Cores` : "--"}
                active={activeTab === "cpu"}
                color={METRIC_COLORS.cpu.stroke}
                onClick={() => setActiveTab("cpu")}
                data={cpuHistory}
              />
              <MetricSidebarItem
                icon={<MemoryStick className="h-4 w-4" />}
                label="Memory"
                value={`${snap?.memory.used_percent.toFixed(0) ?? 0}%`}
                subValue="RAM Utilization"
                active={activeTab === "memory"}
                color={METRIC_COLORS.memory.stroke}
                onClick={() => setActiveTab("memory")}
                data={memoryHistory}
              />
              <MetricSidebarItem
                icon={<HardDrive className="h-4 w-4" />}
                label="Disk 0"
                value={`${snap?.disk.used_percent.toFixed(0) ?? 0}%`}
                subValue="Disk active time"
                active={activeTab === "disk"}
                color={METRIC_COLORS.disk.stroke}
                onClick={() => setActiveTab("disk")}
                data={diskHistory}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="col-span-1 p-6 lg:col-span-9">
            <div className="mb-6 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-light">{activeLabel}</h2>
                <div className="text-sm font-medium text-muted-foreground">
                  {snap?.host.hostname}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{activeSubtitle}</p>
            </div>

            <div className="relative mb-8 h-87.5 w-full bg-background/50">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeColor.stroke} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={activeColor.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted-foreground/30" vertical horizontal />
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 100]} orientation="right" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(2)}%`} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const raw = Number(payload[0].value ?? 0)
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-md">
                            <p className="text-sm font-bold" style={{ color: activeColor.stroke }}>{raw.toFixed(2)}%</p>
                            <p className="text-[10px] text-muted-foreground">{payload[0].payload.t}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={activeColor.stroke}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Stats Footer */}
            <div className="mt-auto grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
              {activeTab === "cpu" ? (
                <>
                  <Stat label="Utilization" value={`${snap?.cpu.usage_percent.toFixed(0) ?? 0}%`} />
                  <Stat label="Cores" value={String(snap?.cpu.cores_logical ?? "--")} />
                  <Stat label="Up time" value={snap?.host.uptime_human ?? "0:00:00"} />
                  <Stat label="Schema" value={snap?.schema ?? "--"} />
                </>
              ) : activeTab === "memory" ? (
                <>
                  <Stat label="Utilization" value={`${snap?.memory.used_percent.toFixed(0) ?? 0}%`} />
                  <Stat label="Hostname" value={snap?.host.hostname ?? "--"} />
                  <Stat label="Up time" value={snap?.host.uptime_human ?? "0:00:00"} />
                </>
              ) : (
                <>
                  <Stat label="Active time" value={`${snap?.disk.used_percent.toFixed(0) ?? 0}%`} />
                  <Stat label="Hostname" value={snap?.host.hostname ?? "--"} />
                  <Stat label="Up time" value={snap?.host.uptime_human ?? "0:00:00"} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function MetricSidebarItem({
  icon,
  label,
  value,
  subValue,
  active,
  color,
  onClick,
  data,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue: string;
  active: boolean;
  color: string;
  onClick: () => void;
  data: Point[];
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 border-b p-4 text-left transition-colors hover:bg-muted/50",
        active && "bg-muted hover:bg-muted"
      )}
    >
      <div className={cn("mt-1 shrink-0")} style={{ color: active ? color : undefined }}>{icon}</div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="text-xs font-semibold" style={{ color: active ? color : undefined }}>{value}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-4">
          <span className="truncate text-[10px] text-muted-foreground">{subValue}</span>
          <div className="h-6 w-16 opacity-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <Area type="monotone" dataKey="v" stroke={color} fill="none" strokeWidth={1} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-lg font-medium tracking-tight truncate">{value}</span>
    </div>
  );
}
