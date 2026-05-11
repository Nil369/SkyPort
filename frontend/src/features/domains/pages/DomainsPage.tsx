import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { platformApi } from "@/features/platform/api";

export function DomainsPage() {
  const [domain, setDomain] = React.useState("");
  const [port, setPort] = React.useState("80");
  const [email, setEmail] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [enableSSL, setEnableSSL] = React.useState(true);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);

  const caddyStatus = useQuery({ queryKey: ["caddy-status"], queryFn: platformApi.caddyStatus });
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const mappings = useQuery({ queryKey: ["domain-mappings"], queryFn: platformApi.listDomainMappings });
  const [installCommand, setInstallCommand] = React.useState<string | null>(null);

  const generate = useMutation({
    mutationFn: platformApi.generateDomainProxy,
    onSuccess: (data) => {
      setResult(data as Record<string, unknown>);
      toast.success("Proxy config generated");
      mappings.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Generation failed"),
  });

  const saveMapping = useMutation({
    mutationFn: async () => {
      const payload = {
        domain: domain.trim(),
        port: Number(port),
        type: "caddy" as const,
        enable_ssl: enableSSL,
        email: email.trim() || undefined,
        project_id: projectId ? Number(projectId) : undefined,
      };
      if (editingId) {
        return platformApi.updateDomainMapping(editingId, payload);
      }
      return platformApi.createDomainMapping(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Mapping updated" : "Mapping saved");
      setEditingId(null);
      setDomain("");
      setPort("80");
      setEmail("");
      setProjectId("");
      mappings.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Save failed"),
  });

  const deleteMapping = useMutation({
    mutationFn: (id: number) => platformApi.deleteDomainMapping(id),
    onSuccess: () => {
      toast.success("Mapping deleted");
      mappings.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Delete failed"),
  });

  const installCaddy = useMutation({
    mutationFn: platformApi.caddyInstall,
    onSuccess: (data: any) => {
      if (data?.install_command) {
        setInstallCommand(String(data.install_command));
      }
      if (data?.executed) {
        toast.success("Caddy install started");
      }
      caddyStatus.refetch();
    },
    onError: (err: any) => {
      const msg = String(err?.response?.data?.error?.message ?? "Caddy install failed");
      const concise = msg.split("\n").slice(-1)[0] || msg;
      toast.error(concise);
    },
  });

  return (
    <PageShell>
      <PageHeader title="Domains" subtitle="Domains, SSL, and routing" />

      <Card>
        <CardHeader>
          <CardTitle>Caddy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs ${caddyStatus.data?.installed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
              {caddyStatus.data?.installed ? "Caddy installed" : "Caddy not installed"}
            </span>
            {caddyStatus.data?.version ? (
              <span className="rounded-full bg-muted px-2 py-1 text-xs">{caddyStatus.data.version}</span>
            ) : null}
          </div>
          {installCommand ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">{installCommand}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.open("https://caddyserver.com/docs/", "_blank", "noopener,noreferrer")}>Docs</Button>
            <Button size="sm" variant="outline" onClick={() => window.open("https://caddyserver.com/docs/install", "_blank", "noopener,noreferrer")}>Install guide</Button>
            <Button size="sm" variant="outline" onClick={() => installCaddy.mutate(false)}>Show install command</Button>
            <Button size="sm" onClick={() => installCaddy.mutate(true)} disabled={installCaddy.isPending}>
              {installCaddy.isPending ? "Installing..." : "Install Caddy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate reverse proxy config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Input placeholder="Target port" value={port} onChange={(e) => setPort(e.target.value)} />
          <Input placeholder="Email (for TLS)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Project (optional)</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={enableSSL} onChange={(e) => setEnableSSL(e.target.checked)} />
            Enable TLS (Caddy auto HTTPS)
          </label>
          <Button
            onClick={() =>
              generate.mutate({
                domain: domain.trim(),
                port: Number(port),
                type: "caddy",
                enable_ssl: enableSSL,
                email: email.trim() || undefined,
                project_id: projectId ? Number(projectId) : undefined,
              })
            }
            disabled={!domain.trim() || !port}
          >
            Generate config
          </Button>
          <Button
            variant="outline"
            onClick={() => saveMapping.mutate()}
            disabled={!domain.trim() || !port}
          >
            {editingId ? "Save changes" : "Save mapping"}
          </Button>
          {editingId ? (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setDomain("");
                setPort("80");
                setEmail("");
                setProjectId("");
                setEnableSSL(true);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
          {result ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domain mappings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Domain</th>
                <th className="py-2">Port</th>
                <th className="py-2">Project</th>
                <th className="py-2">TLS</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(mappings.data?.mappings ?? []).map((m) => {
                const projectName = projects.data?.find((p) => p.id === (m.project_id ?? 0))?.name ?? "-";
                return (
                  <tr key={m.id} className="border-t border-border/70">
                    <td className="py-2 font-mono text-xs">{m.domain}</td>
                    <td className="py-2 font-mono text-xs">{m.port}</td>
                    <td className="py-2 text-xs text-muted-foreground">{projectName}</td>
                    <td className="py-2 text-xs">{m.enable_ssl ? "Enabled" : "Off"}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(m.id);
                            setDomain(m.domain);
                            setPort(String(m.port));
                            setEmail(m.email ?? "");
                            setProjectId(m.project_id ? String(m.project_id) : "");
                            setEnableSSL(Boolean(m.enable_ssl));
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteMapping.mutate(m.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!mappings.data?.mappings?.length ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                    No domain mappings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
