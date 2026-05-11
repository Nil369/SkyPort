import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { platformApi } from "@/features/platform/api";

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = React.useState("");
  const [port, setPort] = React.useState("");
  const [startCmd, setStartCmd] = React.useState("");
  const [strategy, setStrategy] = React.useState<"docker" | "pm2" | "native">("docker");
  const [workingDir, setWorkingDir] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const [page, setPage] = React.useState(1);

  const location = useLocation();
  const searchQuery = React.useMemo(() => new URLSearchParams(location.search).get("q")?.trim().toLowerCase() ?? "", [location.search]);

  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const deployments = useQuery({ queryKey: ["deployments"], queryFn: platformApi.listDeployments });

  const filteredDeployments = React.useMemo(() => {
    const items = deployments.data ?? [];
    if (!searchQuery) {
      return items;
    }

    return items.filter((d) => {
      const projectName = projects.data?.find((p) => p.id === (d.projectID ?? d.project_id))?.name ?? "";
      const status = String(d.status ?? "").toLowerCase();
      const runtime = String(d.runtime ?? "").toLowerCase();
      const strategy = String(d.strategy ?? "").toLowerCase();
      return (
        String(d.id).includes(searchQuery) ||
        status.includes(searchQuery) ||
        runtime.includes(searchQuery) ||
        strategy.includes(searchQuery) ||
        projectName.toLowerCase().includes(searchQuery)
      );
    });
  }, [deployments.data, projects.data, searchQuery]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredDeployments.length / pageSize));
  const visibleDeployments = filteredDeployments.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const createDeployment = useMutation({
    mutationFn: platformApi.createDeployment,
    onSuccess: () => {
      toast.success("Deployment created");
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Failed to create deployment"),
  });

  const rollout = useMutation({
    mutationFn: (id: number) => platformApi.rolloutDeployment(id, "restart"),
    onSuccess: () => toast.success("Rollout started"),
  });

  const deleteDeployment = useMutation({
    mutationFn: platformApi.deleteDeployment,
    onSuccess: () => {
      toast.success("Deployment deleted");
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Failed to delete deployment"),
  });

  return (
    <PageShell>
      <PageHeader title="Deployments" subtitle="Create deployments and roll them out" />

      <Card>
        <CardHeader>
          <CardTitle>New deployment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as "docker" | "pm2" | "native")}
          >
            <option value="docker">Docker</option>
            <option value="pm2">PM2</option>
            <option value="native">Native</option>
          </select>
          <Input placeholder="Port (optional)" value={port} onChange={(e) => setPort(e.target.value)} />
          <Input placeholder="Start command (optional)" value={startCmd} onChange={(e) => setStartCmd(e.target.value)} />
          <Input placeholder="Working directory (optional)" value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} />
          <textarea
            className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm sm:col-span-2 lg:col-span-5"
            placeholder="Environment variables (KEY=VALUE per line)"
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
          />
          <div className="text-xs text-muted-foreground lg:col-span-5">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Examples</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-mono">npm run start</span>
              </li>
              <li>
                <span className="font-mono">node server.js</span>
              </li>
              <li>
                <span className="font-mono">docker run -d --name my-app -p 8080:8080 my-image:latest</span>
              </li>
              <li>
                <span className="font-mono"> pm2 start src/index.js --name "aksha-doc-backend" --env production --max-memory-restart 400M --restart-delay 3000 && pm2 save</span>
              </li>
            </ul>
          </div>
          <Button
            onClick={() =>
              createDeployment.mutate({
                project_id: Number(projectId),
                auto_start: true,
                strategy,
                port: port ? Number(port) : undefined,
                env: parseEnvText(envText),
                start_cmd: startCmd.trim() || undefined,
                working_directory: workingDir.trim() || undefined,
              })
            }
            disabled={!projectId || createDeployment.isPending}
          >
            New deployment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deployment list</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {visibleDeployments.map((d) => {
              const projectName = projects.data?.find((p) => p.id === (d.projectID ?? d.project_id))?.name ?? "-";
              return (
                <div key={d.id} className="rounded-lg border border-border/70 bg-muted/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">#{d.id} · {projectName}</div>
                    <Badge variant={d.status === "running" ? "success" : d.status === "failed" ? "danger" : "warning"}>
                      {d.status}
                    </Badge>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>
                      Runtime: <span className="font-mono text-foreground/80">{d.runtime || "-"}</span>
                    </li>
                    <li>
                      Strategy: <span className="font-mono text-foreground/80">{d.strategy || "-"}</span>
                    </li>
                    <li>
                      Project: <span className="font-mono text-foreground/80">{projectName}</span>
                    </li>
                    <li>
                      Port: <span className="font-mono text-foreground/80">{d.port || "-"}</span>
                    </li>
                    <li className="break-words">
                      Error: <span className="font-mono text-foreground/80">{d.error || "-"}</span>
                    </li>
                  </ul>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`http://localhost:${d.port}`, "_blank", "noopener,noreferrer")}
                      disabled={!d.port || d.status !== "running"}
                    >
                      Launch
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rollout.mutate(d.id)}>
                      Restart
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteDeployment.mutate(d.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            {!filteredDeployments.length ? (
              <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No deployments found.
              </div>
            ) : null}
          </div>
        </CardContent>
        {filteredDeployments.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/50 px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredDeployments.length)} of {filteredDeployments.length} deployments
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
