import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Server, Router, Activity } from "lucide-react";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { clusterApi } from "@/features/cluster/api";
import { PERMS, can } from "@/lib/permissions";
import { useAuthStore } from "@/stores/authStore";

export function ServersPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const servers = useQuery({ queryKey: ["cluster", "servers"], queryFn: clusterApi.listServers });
  const agents = useQuery({ queryKey: ["cluster", "agents"], queryFn: clusterApi.listAgents });
  const canManageServers = can(user?.permissions, PERMS.serversManage);
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [fingerprint, setFingerprint] = React.useState("");

  const createServer = useMutation({
    mutationFn: clusterApi.createServer,
    onSuccess: async () => {
      toast.success("Cluster server added");
      setName("");
      setAddress("");
      setFingerprint("");
      await queryClient.invalidateQueries({ queryKey: ["cluster", "servers"] });
    },
    onError: () => {
      toast.error("Unable to add cluster server");
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Server name is required");
      return;
    }
    createServer.mutate({ name, address, fingerprint });
  };

  return (
    <PageShell>
      <PageHeader
        title="Cluster"
        subtitle="Remote SkyPort agents and nodes. Control plane stays decoupled from any single VPS."
        right={
          <Button size="sm" variant="outline" className="font-mono text-xs" onClick={() => document.getElementById("cluster-add-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Server className="size-4" /> Add server
          </Button>
        }
      />

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Server className="size-4 text-muted-foreground" />
          <CardTitle className="font-mono text-base">Add server</CardTitle>
        </CardHeader>
        <CardContent>
          <form id="cluster-add-form" className="grid gap-3 md:grid-cols-[1.1fr_1fr_1fr_auto]" onSubmit={submit}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name" disabled={!canManageServers || createServer.isPending} />
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="IP / hostname" disabled={!canManageServers || createServer.isPending} />
            <Input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="Fingerprint (optional)" disabled={!canManageServers || createServer.isPending} />
            <Button type="submit" disabled={!canManageServers || createServer.isPending} className="font-mono">
              <Server className="size-4" /> Add server
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Router className="size-4 text-muted-foreground" />
            <CardTitle className="font-mono text-base">Servers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (servers.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      No remote servers registered yet. Future agent installs will populate this table.
                    </TableCell>
                  </TableRow>
                ) : (
                  (servers.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="info" className="font-mono text-[10px] uppercase">
                          {s.status || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.address ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle className="font-mono text-base">Agents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Server ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (agents.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      No agents connected. Installer:{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                        curl -fsSL https://skyport/install-agent.sh | bash
                      </code>
                    </TableCell>
                  </TableRow>
                ) : (
                  (agents.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs">{a.version}</TableCell>
                      <TableCell className="font-mono text-xs">{a.server_id}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
