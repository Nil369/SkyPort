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
import { Eye, EyeOff, Copy, X, Zap, Info } from 'lucide-react'
import { parseEnvTextSimple } from "@/lib/envUtils";
import { resolvedStartCommand, withNodeHintsIfApplicable } from "@/lib/runtimeHints";

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
  const [settingsProjectId, setSettingsProjectId] = React.useState<number | null>(null);
  const [showWebhookSecret, setShowWebhookSecret] = React.useState(false);
  const autoFilledDeployProjectId = React.useRef<number | null>(null);

  const location = useLocation();
  const searchQuery = React.useMemo(() => new URLSearchParams(location.search).get("q")?.trim().toLowerCase() ?? "", [location.search]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: platformApi.listProjects,
  });

  const selectedDeployProject = React.useMemo(
    () => projects.data?.find((project) => project.id === deployProjectId) ?? null,
    [projects.data, deployProjectId],
  );

  const selectedDeployRuntime = useQuery({
    queryKey: ["project-runtime", deployProjectId, selectedDeployProject?.path],
    queryFn: async () => {
      if (!selectedDeployProject?.path) return null;
      return await platformApi.detectProjectRuntime(selectedDeployProject.path);
    },
    enabled: Boolean(selectedDeployProject?.path),
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

  React.useEffect(() => {
    if (!deployProjectId || !selectedDeployRuntime.data) return;
    if (autoFilledDeployProjectId.current === deployProjectId) return;

    const detected = selectedDeployRuntime.data;
    const hinted = withNodeHintsIfApplicable(detected);
    const runtime = String(hinted.runtime ?? "").toLowerCase();
    const framework = (detected.framework ?? "").toLowerCase();
    const nodeLikeFrameworks = new Set(["next.js", "nestjs", "express", "vite", "react", "nuxt"]);
    const preferPm2 = runtime === "node" || nodeLikeFrameworks.has(framework);

    if (preferPm2) {
      setDeployStrategy("pm2");
    }
    if (detected.detected_port) {
      setDeployPort(String(detected.detected_port));
    }
    const start = resolvedStartCommand(detected);
    if (start) {
      setDeployStartCmd(start);
    }
    if (detected.working_directory) {
      setDeployWorkingDir(detected.working_directory);
    }

    autoFilledDeployProjectId.current = deployProjectId;
  }, [deployProjectId, selectedDeployRuntime.data]);

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
      autoFilledDeployProjectId.current = null;
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? "Failed to deploy project");
    },
  });

  const getServerBaseUrl = React.useCallback(() => {
    // Get server domain/IP from backend API base URL instead of client origin
    // This works for both localhost, domains, and IP addresses
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin
    return apiBaseUrl
  }, [])

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
              {selectedDeployRuntime.data ? (
                <div className="mb-3 rounded-lg border border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info">Runtime: {selectedDeployRuntime.data.runtime || "unknown"}</Badge>
                    {selectedDeployRuntime.data.framework ? <Badge variant="info">Framework: {selectedDeployRuntime.data.framework}</Badge> : null}
                    {selectedDeployRuntime.data.package_manager ? <Badge variant="info">PM: {selectedDeployRuntime.data.package_manager}</Badge> : null}
                    {selectedDeployRuntime.data.detected_port ? <Badge variant="info">Port: {selectedDeployRuntime.data.detected_port}</Badge> : null}
                  </div>
                </div>
              ) : null}
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
                      env: parseEnvTextSimple(deployEnvText),
                      start_cmd: deployStartCmd.trim() || undefined,
                      working_directory: deployWorkingDir.trim() || undefined,
                    })
                  }
                  disabled={deployProject.isPending}
                >
                  Deploy now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDeployProjectId(null);
                    autoFilledDeployProjectId.current = null;
                  }}
                >
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettingsProjectId(p.id)}
                      >
                        Settings
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

      {/* Settings Modal */}
      {settingsProjectId ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Rollout & Webhook Settings</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSettingsProjectId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Webhook Section */}
            <div className="rounded-lg border border-border/70 p-4">
              <h3 className="font-semibold mb-3">GitHub Webhook Setup</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1 block">
                    Webhook URL (use for GitHub webhook setup)
                  </Label>
                  <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${getServerBaseUrl()}/api/v1/webhooks/github/${settingsProjectId}`}
                        className="font-mono text-xs"
                      />
                    <Button
                      size="sm"
                      variant="outline"
                      title="Copy webhook URL"
                      onClick={() => {
                        navigator.clipboard.writeText(`${getServerBaseUrl()}/api/v1/webhooks/github/${settingsProjectId}`);
                        toast.success("Webhook URL copied to clipboard");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-1" />
                    <span>This URL uses your SkyPort server's domain/IP, not your browser's. GitHub will send push events here.</span>
                  </p>
                </div>
                <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center justify-between">
                      <span>Webhook Secret</span>
                      <button
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="text-xs text-blue-500 hover:text-blue-600 font-normal flex items-center gap-2"
                        title={showWebhookSecret ? 'Hide secret' : 'Show secret'}
                      >
                        {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="capitalize">{showWebhookSecret ? 'Hide' : 'Show'}</span>
                      </button>
                    </Label>
                  <div className="relative">
                    <Input
                      readOnly
                      type={showWebhookSecret ? "text" : "password"}
                      value="GITHUB_WEBHOOK_SECRET_VALUE_HERE"
                      className="font-mono text-xs pr-10"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('GITHUB_WEBHOOK_SECRET_VALUE_HERE');
                        toast.success('Secret copied to clipboard');
                      }}
                      className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
                      title="Copy secret"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Set the same secret in:
                  </p>
                  <ol className="text-xs text-muted-foreground list-decimal pl-5 space-y-1 mt-1">
                    <li>SkyPort environment: <code className="bg-muted px-1 rounded">GITHUB_WEBHOOK_SECRET=your_secret_here</code></li>
                    <li>GitHub webhook: paste same value in "Secret" field</li>
                  </ol>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs space-y-3">
                <div className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2"><Zap className="h-4 w-4" /> How it works:</div>
                <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                  <li><strong>1. GitHub Webhook:</strong> When you push code, GitHub sends a notification to SkyPort</li>
                  <li><strong>2. SkyPort Receives:</strong> SkyPort's webhook endpoint verifies the secret and receives the push event</li>
                  <li><strong>3. Auto-Deploy:</strong> SkyPort automatically triggers a new deployment of your project</li>
                  <li><strong>4. Rolling Update:</strong> If using Docker strategy, new version deploys alongside old one (zero downtime)</li>
                </ul>
                <div className="border-t border-blue-200 dark:border-blue-800 pt-3 mt-3">
                  <div className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Setup steps:</div>
                  <ol className="list-decimal pl-5 space-y-1 text-blue-800 dark:text-blue-200">
                    <li>Go to GitHub repo → Settings → Webhooks → Add webhook</li>
                    <li>Paste the <strong>Webhook URL</strong> above in the Payload URL field</li>
                    <li>Set Content type to <strong>application/json</strong></li>
                    <li>Paste the <strong>Webhook Secret</strong> in GitHub's Secret field</li>
                    <li>Choose event: select <strong>"Let me select individual events"</strong> → check <strong>Push</strong></li>
                    <li>Check <strong>"Active"</strong></li>
                    <li>Click <strong>"Add webhook"</strong></li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Rollout Section */}
            <div className="rounded-lg border border-border/70 p-4">
              <h3 className="font-semibold mb-3">Rolling Updates (Zero Downtime)</h3>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Rolling updates allow you to deploy new versions without downtime. SkyPort gradually shifts traffic from old containers to new ones.
                </p>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs">
                  <div className="font-semibold text-green-900 dark:text-green-100 mb-2">✓ How it works:</div>
                  <ol className="list-decimal pl-5 space-y-1 text-green-800 dark:text-green-200">
                    <li>GitHub webhook triggers deployment (you push code)</li>
                    <li>SkyPort pulls latest code and builds new Docker image</li>
                    <li>New container starts running (old one still serving traffic)</li>
                    <li>Health checks verify new container is working</li>
                    <li>Traffic gradually shifts to new container</li>
                    <li>Old container stops (zero downtime achieved!)</li>
                  </ol>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                  <strong>⚠️ Requirements:</strong>
                </div>
                <ul className="list-disc pl-5 text-muted-foreground space-y-1 text-sm">
                  <li>✓ Deployment strategy: <strong>Docker</strong></li>
                  <li>✓ Server RAM: <strong>≥2GB available</strong></li>
                  <li>✓ GitHub webhook: <strong>configured above</strong></li>
                  <li>✓ Project accessibility: <strong>publicly reachable or via VPN</strong></li>
                </ul>
              </div>
            </div>

            {/* Public URL Section */}
            <div className="rounded-lg border border-border/70 p-4">
              <h3 className="font-semibold mb-3">Public URL</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>To make your deployment publicly accessible:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Use a domain via Domains section</li>
                  <li>Or use ngrok for quick public access: <code className="bg-muted px-1 rounded text-xs">ngrok http 3000</code></li>
                </ol>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setSettingsProjectId(null)}>
              Close
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
