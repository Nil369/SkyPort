import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { platformApi } from "@/features/platform/api";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const info = useQuery({ queryKey: ["system-info"], queryFn: platformApi.systemInfo });
  const gitStatus = useQuery({ queryKey: ["git-status"], queryFn: platformApi.gitStatus });
  const gitCreds = useQuery({ queryKey: ["git-credentials"], queryFn: platformApi.getGitCredentials });
  const [gitInstallCommand, setGitInstallCommand] = React.useState<string | null>(null);
  const [gitAuthType, setGitAuthType] = React.useState<"pat" | "ssh">("pat");
  const [gitPat, setGitPat] = React.useState("");
  const [gitSshKey, setGitSshKey] = React.useState("");

  React.useEffect(() => {
    if (gitCreds.data?.git_auth_type) {
      setGitAuthType(gitCreds.data.git_auth_type);
    }
  }, [gitCreds.data?.git_auth_type]);

  const gitInstall = useMutation({
    mutationFn: platformApi.gitInstall,
    onSuccess: (data: any) => {
      if (data?.install_command) {
        setGitInstallCommand(String(data.install_command));
        toast.success("Git install command ready");
      } else if (data?.executed) {
        toast.success("Git install started");
        gitStatus.refetch();
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Git install failed"),
  });

  const saveGitCreds = useMutation({
    mutationFn: platformApi.updateGitCredentials,
    onSuccess: () => {
      toast.success("Git credentials saved");
      setGitPat("");
      setGitSshKey("");
      gitCreds.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Failed to save credentials"),
  });

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
          <Info label="DB Path" value={String((info.data as any)?.db_path ?? "-")} mono />
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

      <Card>
        <CardHeader>
          <CardTitle>Git</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={gitStatus.data?.installed ? "success" : "warning"}>
              {gitStatus.data?.installed ? "Git installed" : "Git not installed"}
            </Badge>
            {gitStatus.data?.version ? <Badge variant="info">{gitStatus.data.version}</Badge> : null}
          </div>
          {gitStatus.data?.path ? (
            <div className="text-xs text-muted-foreground">Path: {gitStatus.data.path}</div>
          ) : null}
          {gitInstallCommand ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
              {gitInstallCommand}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => gitInstall.mutate(false)}>
              Show install command
            </Button>
            <Button size="sm" onClick={() => gitInstall.mutate(true)}>
              Install Git
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Git credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={gitCreds.data?.has_pat ? "success" : "warning"}>PAT: {gitCreds.data?.has_pat ? "saved" : "missing"}</Badge>
            <Badge variant={gitCreds.data?.has_ssh_key ? "success" : "warning"}>SSH key: {gitCreds.data?.has_ssh_key ? "saved" : "missing"}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Auth type</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2"
              value={gitAuthType}
              onChange={(e) => setGitAuthType(e.target.value as "pat" | "ssh")}
            >
              <option value="pat">Personal access token (PAT)</option>
              <option value="ssh">SSH key</option>
            </select>
          </div>
          {gitAuthType === "pat" ? (
            <Input
              placeholder="GitHub PAT (repo scope required)"
              value={gitPat}
              onChange={(e) => setGitPat(e.target.value)}
            />
          ) : (
            <textarea
              className="min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm"
              placeholder="Paste private SSH key"
              value={gitSshKey}
              onChange={(e) => setGitSshKey(e.target.value)}
            />
          )}
          <div className="text-xs text-muted-foreground">
            Saved credentials are used automatically when you create private projects and leave the fields empty.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                saveGitCreds.mutate({
                  git_auth_type: gitAuthType,
                  git_pat: gitAuthType === "pat" ? gitPat.trim() : undefined,
                  git_ssh_key: gitAuthType === "ssh" ? gitSshKey : undefined,
                })
              }
              disabled={saveGitCreds.isPending || (gitAuthType === "pat" && !gitPat.trim()) || (gitAuthType === "ssh" && !gitSshKey.trim())}
            >
              Save credentials
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveGitCreds.mutate({ clear_pat: true, clear_ssh_key: true })}
              disabled={saveGitCreds.isPending}
            >
              Clear stored credentials
            </Button>
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
