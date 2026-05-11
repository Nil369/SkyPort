import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = React.useState("");
  const [port, setPort] = React.useState("");
  const [startCmd, setStartCmd] = React.useState("");

  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const deployments = useQuery({ queryKey: ["deployments"], queryFn: platformApi.listDeployments });

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

  return (
    <PageShell>
      <PageHeader title="Deployments" subtitle="Create deployments and roll them out" />

      <Card>
        <CardHeader>
          <CardTitle>New deployment</CardTitle>
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
          <Input placeholder="Port (optional)" value={port} onChange={(e) => setPort(e.target.value)} />
          <Input placeholder="Start command (optional)" value={startCmd} onChange={(e) => setStartCmd(e.target.value)} />
          <Button
            onClick={() =>
              createDeployment.mutate({
                project_id: Number(projectId),
                auto_start: true,
                port: port ? Number(port) : undefined,
                start_cmd: startCmd.trim() || undefined,
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
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Runtime</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(deployments.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell>#{d.id}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === "running" ? "success" : d.status === "failed" ? "danger" : "warning"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.runtime || "-"}</TableCell>
                  <TableCell>{d.strategy || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => rollout.mutate(d.id)}>
                      Restart
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
