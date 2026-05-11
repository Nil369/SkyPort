import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";

export function ProcessManagerPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = React.useState("");
  const [startCmd, setStartCmd] = React.useState("");
  const [workingDir, setWorkingDir] = React.useState("");
  const [port, setPort] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const [page, setPage] = React.useState(1);

  const pm2Status = useQuery({
    queryKey: ["pm2-status"],
    queryFn: () => platformApi.runtimeInstall("pm2", false),
  });
  const present = Boolean(pm2Status.data?.present);
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const pm2List = useQuery({
    queryKey: ["pm2-list"],
    queryFn: platformApi.listPm2,
    enabled: present,
  });

  const processes = pm2List.data?.processes ?? [];
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(processes.length / pageSize));
  const visibleProcesses = processes.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const pm2Install = useMutation({
    mutationFn: () => platformApi.runtimeInstall("pm2", true),
    onSuccess: () => {
      toast.success("PM2 install started");
      pm2Status.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "PM2 install failed"),
  });

  const pm2Action = useMutation({
    mutationFn: ({ name, action }: { name: string; action: "start" | "stop" | "restart" | "delete" }) =>
      platformApi.pm2Action(name, action),
    onSuccess: () => pm2List.refetch(),
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
      qc.invalidateQueries({ queryKey: ["deployments"] });
      pm2List.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Failed to deploy via PM2"),
  });

  return (
    <PageShell>
      <PageHeader title="Process Manager" subtitle="Manage PM2 apps on low-RAM servers" />

      <Card>
        <CardHeader>
          <CardTitle>PM2</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={present ? "success" : "warning"}>
            {present ? "PM2 installed" : "PM2 not installed"}
          </Badge>
          {pm2Status.data?.found_in ? (
            <Badge variant="info">{pm2Status.data.found_in}</Badge>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => pm2Status.refetch()}>
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
            PM2 docs
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New PM2 deployment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
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
          <div className="text-xs text-muted-foreground lg:col-span-4">
            EXAMPLES:
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-mono"> pm2 start src/index.js --name "aksha-doc-backend" --env production --max-memory-restart 400M --restart-delay 3000 && pm2 save</span>
              </li>
            </ul>
          </div>
          <Button
            onClick={() =>
              pm2Deploy.mutate({
                project_id: Number(projectId),
                auto_start: true,
                strategy: "pm2",
                start_cmd: startCmd.trim() || undefined,
                env: parseEnvText(envText),
                working_directory: workingDir.trim() || undefined,
                port: port ? Number(port) : undefined,
              })
            }
            disabled={!projectId || !startCmd.trim() || pm2Deploy.isPending}
          >
            Deploy with PM2
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PM2 apps</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PID</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>Memory</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProcesses.map((p, idx) => {
                const name = String(p.name ?? p.pm2_env?.name ?? `app-${idx}`);
                const status = String(p.pm2_env?.status ?? "-");
                const pid = String(p.pid ?? p.pm2_env?.pm_pid ?? "-");
                const cpu = Number(p.monit?.cpu ?? 0);
                const memory = Number(p.monit?.memory ?? 0);
                const envPortRaw = (p.pm2_env as any)?.env?.PORT ?? (p.pm2_env as any)?.env?.APP_PORT;
                const envPort = envPortRaw ? Number(envPortRaw) : 0;
                const canLaunch = status === "online" && envPort > 0 && Number.isFinite(envPort);

                return (
                  <TableRow key={`${name}-${idx}`}>
                    <TableCell>{name}</TableCell>
                    <TableCell>
                      <Badge variant={status === "online" ? "success" : status === "stopped" ? "warning" : "info"}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell>{pid}</TableCell>
                    <TableCell>{cpu ? `${cpu}%` : "-"}</TableCell>
                    <TableCell>{memory ? formatBytes(memory) : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`http://localhost:${envPort}`, "_blank", "noopener,noreferrer")}
                          disabled={!canLaunch}
                        >
                          Launch
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => pm2Action.mutate({ name, action: "start" })}>
                          Start
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => pm2Action.mutate({ name, action: "stop" })}>
                          Stop
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => pm2Action.mutate({ name, action: "restart" })}>
                          Restart
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => pm2Action.mutate({ name, action: "delete" })}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!processes.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No PM2 processes found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
        {processes.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/50 px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, processes.length)} of {processes.length} apps
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}

function parseEnvText(raw: string) {
  const env: Record<string, string> = {};
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx <= 0) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1);
      if (!key) return;
      env[key] = value;
    });
  return Object.keys(env).length ? env : undefined;
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
