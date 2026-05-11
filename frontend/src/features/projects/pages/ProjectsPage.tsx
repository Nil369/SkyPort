import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";

export function ProjectsPage() {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [gitUrl, setGitUrl] = React.useState("");
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [authType, setAuthType] = React.useState<"pat" | "ssh">("pat");
  const [gitPat, setGitPat] = React.useState("");
  const [gitSshKey, setGitSshKey] = React.useState("");
  const [gitBranch, setGitBranch] = React.useState("");
  const [deployProjectId, setDeployProjectId] = React.useState<number | null>(null);
  const [deployStrategy, setDeployStrategy] = React.useState<"docker" | "pm2" | "native">("docker");
  const [deployPort, setDeployPort] = React.useState("");
  const [deployStartCmd, setDeployStartCmd] = React.useState("");
  const [deployWorkingDir, setDeployWorkingDir] = React.useState("");
  const [deployEnvText, setDeployEnvText] = React.useState("");

  const location = useLocation();
  const searchQuery = React.useMemo(() => new URLSearchParams(location.search).get("q")?.trim().toLowerCase() ?? "", [location.search]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: platformApi.listProjects,
  });

  const [page, setPage] = React.useState(1);

  const filteredProjects = React.useMemo(() => {
    const items = projects.data ?? [];
    if (!searchQuery) {
      return items;
    }

    return items.filter((p) => {
      const name = String(p.name ?? "").toLowerCase();
      const path = String(p.path ?? "").toLowerCase();
      const repository = String(p.gitURL ?? p.git_url ?? "").toLowerCase();
      return (
        name.includes(searchQuery) ||
        path.includes(searchQuery) ||
        repository.includes(searchQuery)
      );
    });
  }, [projects.data, searchQuery]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const visibleProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const createProject = useMutation({
    mutationFn: platformApi.createProject,
    onSuccess: () => {
      setName("");
      setGitUrl("");
      setGitPat("");
      setGitSshKey("");
      setGitBranch("");
      toast.success("Project created");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? "Failed to create project");
    },
  });

  const deleteProject = useMutation({
    mutationFn: platformApi.deleteProject,
    onSuccess: () => {
      toast.success("Project deleted");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const deployProject = useMutation({
    mutationFn: platformApi.createDeployment,
    onSuccess: () => {
      toast.success("Deployment started");
      setDeployProjectId(null);
      setDeployPort("");
      setDeployStartCmd("");
      setDeployWorkingDir("");
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? "Failed to deploy project");
    },
  });

  return (
    <PageShell>
      <PageHeader title="Projects" subtitle="Create and manage repository projects" />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Git URL"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
          />
          <Input
            placeholder="Git branch (optional)"
            value={gitBranch}
            onChange={(e) => setGitBranch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private repository
          </label>
          {isPrivate ? (
            <div className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex items-center gap-3 text-sm">
                <Label>Auth type</Label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as "pat" | "ssh")}
                >
                  <option value="pat">Personal access token (PAT)</option>
                  <option value="ssh">SSH key</option>
                </select>
              </div>
              {authType === "pat" ? (
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
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                GitHub steps:
                <br />- PAT: GitHub → Settings → Developer settings → Personal access tokens → Generate token with <code>repo</code> access.
                <br />- SSH: run <code>ssh-keygen</code>, add public key in GitHub → Settings → SSH and GPG keys, paste private key here.
                <br />- Tip: leave credentials empty to use saved values from Settings.
              </div>
            </div>
          ) : null}
          <Button
            onClick={() =>
              createProject.mutate({
                name: name.trim(),
                git_url: gitUrl.trim() || undefined,
                git_branch: gitBranch.trim() || undefined,
                private: isPrivate,
                git_auth_type: isPrivate ? authType : undefined,
                git_pat: isPrivate && authType === "pat" ? gitPat.trim() : undefined,
                git_ssh_key: isPrivate && authType === "ssh" ? gitSshKey : undefined,
              })
            }
            disabled={
              !name.trim() ||
              createProject.isPending ||
              (isPrivate && authType === "pat" && !gitPat.trim()) ||
              (isPrivate && authType === "ssh" && !gitSshKey.trim())
            }
          >
            Create project
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project list</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {deployProjectId ? (
            <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 text-sm font-medium">
                Deploy project: {projects.data?.find((p) => p.id === deployProjectId)?.name ?? ""}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={deployStrategy}
                  onChange={(e) => setDeployStrategy(e.target.value as "docker" | "pm2" | "native")}
                >
                  <option value="docker">Docker</option>
                  <option value="pm2">PM2</option>
                  <option value="native">Native</option>
                </select>
                <Input
                  placeholder="Port (optional)"
                  value={deployPort}
                  onChange={(e) => setDeployPort(e.target.value)}
                />
                <Input
                  placeholder="Start command (optional)"
                  value={deployStartCmd}
                  onChange={(e) => setDeployStartCmd(e.target.value)}
                />
                <Input
                  placeholder="Working directory (optional)"
                  value={deployWorkingDir}
                  onChange={(e) => setDeployWorkingDir(e.target.value)}
                />
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm sm:col-span-2 lg:col-span-4"
                  placeholder="Environment variables (KEY=VALUE per line)"
                  value={deployEnvText}
                  onChange={(e) => setDeployEnvText(e.target.value)}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Examples: <span className="font-mono">npm run start</span>, <span className="font-mono">node server.js</span>, <span className="font-mono">pm2 start src/index.js --name "aksha-doc-backend" --env production --max-memory-restart 400M --restart-delay 3000 && pm2 save</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    deployProject.mutate({
                      project_id: deployProjectId,
                      auto_start: true,
                      strategy: deployStrategy,
                      port: deployPort ? Number(deployPort) : undefined,
                      env: parseEnvText(deployEnvText),
                      start_cmd: deployStartCmd.trim() || undefined,
                      working_directory: deployWorkingDir.trim() || undefined,
                    })
                  }
                  disabled={deployProject.isPending}
                >
                  Deploy now
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeployProjectId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProjects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      <Badge variant={p.private ? "warning" : "success"}>
                        {p.private ? "Private" : "Public"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.path}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.gitURL ?? p.git_url ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeployProjectId(p.id)}
                        disabled={deployProject.isPending}
                      >
                        Deploy
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteProject.mutate(p.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredProjects.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No projects found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
        {filteredProjects.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/50 px-4 py-3 text-sm">
            <div className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProjects.length)} of {filteredProjects.length} projects
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
