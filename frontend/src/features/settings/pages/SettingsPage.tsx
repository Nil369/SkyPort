import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";
import { platformApi } from "@/features/platform/api";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const info = useQuery({ queryKey: ["system-info"], queryFn: platformApi.systemInfo });

  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Server configuration" />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span> {user?.name ?? "-"}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span> {user?.email ?? "-"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Host info</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Hostname" value={String(info.data?.hostname ?? "-")} />
          <Info label="OS" value={String(info.data?.os ?? "-")} />
          <Info label="Architecture" value={String(info.data?.architecture ?? "-")} />
          <Info label="CPU Cores" value={String(info.data?.cpu_cores ?? "-")} mono />
          <Info label="Go Version" value={String(info.data?.go_version ?? "-")} mono />
          <Info
            label="Uptime"
            value={formatUptime(Number(info.data?.uptime ?? 0))}
            mono
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="mb-2 text-xs text-muted-foreground">Memory</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Total: {formatBytes(Number((info.data as any)?.memory?.total_bytes ?? 0))}</Badge>
              <Badge variant="warning">Used: {formatBytes(Number((info.data as any)?.memory?.used_bytes ?? 0))}</Badge>
              <Badge variant="success">Free: {formatBytes(Number((info.data as any)?.memory?.free_bytes ?? 0))}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-sm" : "text-sm"}>{value}</div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes || Number.isNaN(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(seconds: number) {
  if (!seconds || Number.isNaN(seconds)) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
