import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Server, ShieldCheck, Store, Users, Wifi } from "lucide-react";
import { useNavigate } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { marketplaceApi } from "@/features/marketplace/api";
import { platformApi } from "@/features/platform/api";
import { usersApi } from "@/features/users/api";
import { useWebSocket } from "@/services/ws/useWebSocket";

const PERMISSION_KEYS = [
  "filesystem.write",
  "docker.manage",
  "deployments.create",
  "deployments.delete",
  "marketplace.install",
  "settings.manage",
  "users.manage",
  "terminal.access",
];

const ROLE_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  owner: "info",
  admin: "danger",
  developer: "success",
  viewer: "warning",
};

export function AdminPage() {
  const navigate = useNavigate();
  const { getStatus } = useWebSocket();

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: usersApi.listUsers });
  const activity = useQuery({ queryKey: ["admin", "activity"], queryFn: usersApi.listActivity });
  const logins = useQuery({ queryKey: ["admin", "logins"], queryFn: usersApi.listLogins });
  const system = useQuery({ queryKey: ["admin", "system"], queryFn: platformApi.systemInfo });
  const marketplace = useQuery({ queryKey: ["admin", "marketplace"], queryFn: marketplaceApi.listApps });

  const metricsWs = getStatus("metrics");
  const terminalWs = getStatus("terminal");
  const connected = metricsWs === "connected" || terminalWs === "connected";

  return (
    <PageShell>
      <PageHeader
        title="Admin Panel"
        subtitle="User management, roles, sessions, audit logs, health, marketplace, and realtime connections."
        right={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/team")}>User management</Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/marketplace")}>Marketplace</Button>
            <Button size="sm" onClick={() => navigate("/settings")}>Settings</Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard title="User Management" icon={<Users className="size-4" />} value={`${users.data?.length ?? 0} users`} meta="invite, edit, enable/disable, reset password, delete" />
        <SummaryCard title="Marketplace" icon={<Store className="size-4" />} value={`${marketplace.data?.length ?? 0} apps`} meta="manifest-backed catalog" />
        <SummaryCard title="Server Health" icon={<Server className="size-4" />} value={String(system.data?.hostname ?? "-")} meta={`WS ${connected ? "online" : "reconnecting/offline"}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" /> User Management
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Online</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data ?? []).slice(0, 8).map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(user.roles ?? []).map((role) => (
                          <Badge key={role} variant={ROLE_BADGE[role] ?? "default"} className="uppercase">{role}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.enabled ? "success" : "warning"}>{user.enabled ? "enabled" : "disabled"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.online ? "success" : "warning"}>{user.online ? "online" : "offline"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => navigate("/team")}>Open full user CRUD</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Roles & Permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Granular access control is already enforced by backend guards and frontend permission-aware rendering.</p>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_KEYS.map((key) => (
                <Badge key={key} variant="info" className="font-mono text-[10px] uppercase">{key}</Badge>
              ))}
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Roles: owner, admin, developer, viewer. Use the Team page for assignment and the backend middleware for enforcement.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Active Sessions and Audit Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent logins</div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(logins.data ?? []).slice(0, 6).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={row.success ? "success" : "warning"}>{row.success ? "success" : "failed"}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.ip ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Audit trail</div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activity.data ?? []).slice(0, 6).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.action}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.target ?? "-"}</TableCell>
                        <TableCell className="max-w-55 truncate font-mono text-xs text-muted-foreground">{row.detail ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4" /> Marketplace Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {(marketplace.data ?? []).slice(0, 8).map((app) => (
                <Badge key={app.slug} variant={app.featured ? "success" : "default"} className="font-mono text-[10px] uppercase">{app.name}</Badge>
              ))}
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Manage catalog manifests, featured flags, CDN images, install modes, and health metadata from the app registry.
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/marketplace")}>Open marketplace</Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="size-4" /> Realtime Connections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusLine label="Metrics" value={metricsWs} />
            <StatusLine label="Terminal" value={terminalWs} />
            <StatusLine label="API" value="connected" />
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Websocket-driven updates keep logs, progress, and health state live without heavy polling.
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function SummaryCard({ title, icon, value, meta }: { title: string; icon: React.ReactNode; value: string; meta: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {icon}
          <span>{title}</span>
        </div>
        <div className="text-xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  const variant = value === "connected" ? "success" : value === "reconnecting" || value === "connecting" ? "warning" : "danger";
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}
