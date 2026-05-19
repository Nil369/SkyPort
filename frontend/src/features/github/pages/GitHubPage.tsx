import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ExternalLink, Import, RefreshCw, Search, ShieldCheck, Rocket } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { platformApi, type GitHubRepository } from "@/features/platform/api";

export function GitHubPage() {
  const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("all");
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [selectedRepo, setSelectedRepo] = React.useState<GitHubRepository | null>(null);
  const [branch, setBranch] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [deploymentMode, setDeploymentMode] = React.useState<"docker" | "native" | "pm2">("docker");
  const [workingDirectory, setWorkingDirectory] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const [connectForm, setConnectForm] = React.useState({
    authType: "app" as "app" | "pat" | "ssh",
    installationId: "",
    accountLogin: "",
    accountType: "",
    pat: "",
    sshPrivateKey: "",
  });

  const installQuery = useQuery({ queryKey: ["github", "install"], queryFn: platformApi.githubInstall });
  const setupQuery = useQuery({ queryKey: ["github", "setup"], queryFn: platformApi.githubSetup });
  const reposQuery = useQuery({
    queryKey: ["github", "repositories", query, ownerFilter],
    queryFn: () =>
      platformApi.githubRepositories({
        q: query.trim() || undefined,
        refresh: false,
      }),
  });

  const connectMutation = useMutation({
    mutationFn: platformApi.githubConnect,
    onSuccess: async () => {
      toast.success("GitHub connection saved");
      setConnectOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["github", "setup"] }),
        qc.invalidateQueries({ queryKey: ["github", "install"] }),
        qc.invalidateQueries({ queryKey: ["github", "repositories"] }),
      ]);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Connection failed"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRepo) throw new Error("No repository selected");
      const imported = await platformApi.githubImport({
        installation_id: selectedRepo.installation_id,
        repository_id: selectedRepo.repository_id,
        full_name: selectedRepo.full_name,
        name: selectedRepo.name,
        owner: selectedRepo.owner,
        clone_url: selectedRepo.clone_url,
        ssh_url: selectedRepo.ssh_url,
        branch: branch.trim() || selectedRepo.selected_branch || selectedRepo.default_branch,
        deployment_mode: deploymentMode,
        project_name: projectName.trim() || selectedRepo.name,
        auth_type: connectForm.authType,
        pat: connectForm.pat.trim() || undefined,
        ssh_private_key: connectForm.sshPrivateKey.trim() || undefined,
        working_directory: workingDirectory.trim() || undefined,
        environment: parseEnvText(envText),
        selected: true,
      });

      const strategy = String(imported.deployment_suggestion.recommended_mode ?? deploymentMode) as "docker" | "native" | "pm2";
      const projectId = Number(imported.project.id);
      await platformApi.createDeployment({
        project_id: projectId,
        strategy,
        auto_start: true,
        working_directory: String((imported.deployment_suggestion.working_directory ?? workingDirectory.trim()) || ""),
        start_cmd: String((imported.runtime.start_command ?? imported.deployment_suggestion.start_command) || ""),
      });
      return imported;
    },
    onSuccess: async (imported) => {
      toast.success(`Imported ${imported.repository.full_name} and started deployment`);
      setPreviewOpen(false);
      setSelectedRepo(null);
      setProjectName("");
      setBranch("");
      setEnvText("");
      setWorkingDirectory("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["deployments"] });
      await qc.invalidateQueries({ queryKey: ["github", "repositories"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? err?.message ?? "Import failed"),
  });

  const repositories = React.useMemo(() => {
    const items = reposQuery.data ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((repo) => {
      const ownerMatch = ownerFilter === "all" || repo.owner === ownerFilter;
      const textMatch =
        !q ||
        repo.full_name.toLowerCase().includes(q) ||
        repo.name.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q) ||
        (repo.language ?? "").toLowerCase().includes(q) ||
        (repo.framework ?? "").toLowerCase().includes(q);
      return ownerMatch && textMatch;
    });
  }, [ownerFilter, query, reposQuery.data]);

  const owners = React.useMemo(() => {
    return Array.from(new Set((reposQuery.data ?? []).map((repo) => repo.owner).filter(Boolean))).sort();
  }, [reposQuery.data]);

  const setup = setupQuery.data?.setup;
  const installUrl = installQuery.data?.install ?? setup?.app_install_url ?? "https://github.com/apps/skyportdeploy/installations/new";

  return (
    <PageShell>
      <PageHeader
        title="GitHub"
        subtitle="Connect a GitHub App installation or fallback credentials, browse repositories, and import them into SkyPort projects."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConnectOpen(true)}>
              Connect GitHub
            </Button>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["github", "repositories"] })}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories, descriptions, languages…" className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={ownerFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setOwnerFilter("all")}>All organizations</Button>
            {owners.map((owner) => (
              <Button key={owner} variant={ownerFilter === owner ? "default" : "outline"} size="sm" onClick={() => setOwnerFilter(owner)}>
                {owner}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3 text-sm">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="size-4" /> Integration status
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={setup?.has_app_config ? "success" : "warning"}>{setup?.has_app_config ? "GitHub App configured" : "PAT/SSH fallback"}</Badge>
            <Badge variant="info">{setup?.recommended_mode ?? "docker"} recommended</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {setup?.app_install_url ? "Open the install URL, complete the GitHub App installation, then save the installation ID here." : "Configure app credentials in the server environment or use PAT/SSH fallback."}
          </div>
          <a className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" href={installUrl} target="_blank" rel="noreferrer">
            Open install URL <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {repositories.map((repo) => (
          <Card key={repo.id || repo.repository_id || repo.full_name} className="overflow-hidden border-border/70 bg-card/70 shadow-sm transition-transform hover:-translate-y-0.5">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{repo.full_name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{repo.description || "No description provided"}</p>
                </div>
                <Badge variant={repo.private ? "warning" : "success"}>{repo.private ? "Private" : "Public"}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {repo.language ? <Badge variant="info">{repo.language}</Badge> : null}
                {repo.framework ? <Badge variant="default">{repo.framework}</Badge> : null}
                <Badge variant="default">{repo.default_branch || "main"}</Badge>
                <Badge variant="default">{repo.deployment_mode || "auto"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <InfoRow label="Owner" value={repo.owner} />
                <InfoRow label="Branch" value={repo.selected_branch || repo.default_branch || "main"} />
                <InfoRow label="Runtime" value={repo.runtime || "auto"} />
                <InfoRow label="Selected" value={repo.selected ? "Yes" : "No"} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  setSelectedRepo(repo);
                  setProjectName(repo.name);
                  setBranch(repo.selected_branch || repo.default_branch || "main");
                  setDeploymentMode((repo.deployment_mode as "docker" | "native" | "pm2") || "docker");
                  setWorkingDirectory("");
                  setEnvText("");
                  setPreviewOpen(true);
                }}>
                  <Import className="mr-2 size-4" />
                  Import
                </Button>
                {repo.homepage_url ? (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={repo.homepage_url} target="_blank" rel="noreferrer">Repo</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect GitHub</DialogTitle>
            <DialogDescription>
              Save a GitHub App installation or fallback credentials so SkyPort can cache repositories and keep the import workflow lightweight.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Auth type</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3" value={connectForm.authType} onChange={(e) => setConnectForm((prev) => ({ ...prev, authType: e.target.value as any }))}>
                  <option value="app">GitHub App</option>
                  <option value="pat">Personal access token</option>
                  <option value="ssh">SSH key</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Installation ID</Label>
                <Input value={connectForm.installationId} onChange={(e) => setConnectForm((prev) => ({ ...prev, installationId: e.target.value }))} placeholder="Optional GitHub installation ID" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Account login</Label>
                <Input value={connectForm.accountLogin} onChange={(e) => setConnectForm((prev) => ({ ...prev, accountLogin: e.target.value }))} placeholder="octocat or org name" />
              </div>
              <div className="space-y-2">
                <Label>Account type</Label>
                <Input value={connectForm.accountType} onChange={(e) => setConnectForm((prev) => ({ ...prev, accountType: e.target.value }))} placeholder="User or Organization" />
              </div>
            </div>
            {connectForm.authType === "pat" ? (
              <div className="space-y-2">
                <Label>PAT</Label>
                <Input value={connectForm.pat} onChange={(e) => setConnectForm((prev) => ({ ...prev, pat: e.target.value }))} placeholder="GitHub PAT with repo access" />
              </div>
            ) : null}
            {connectForm.authType === "ssh" ? (
              <div className="space-y-2">
                <Label>SSH private key</Label>
                <Textarea value={connectForm.sshPrivateKey} onChange={(e) => setConnectForm((prev) => ({ ...prev, sshPrivateKey: e.target.value }))} placeholder="Paste the private SSH key" className="min-h-36 font-mono text-xs" />
              </div>
            ) : null}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
              GitHub App install URL: <a href={installUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{installUrl}</a>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                connectMutation.mutate({
                  auth_type: connectForm.authType,
                  installation_id: connectForm.installationId ? Number(connectForm.installationId) : undefined,
                  account_login: connectForm.accountLogin || undefined,
                  account_type: connectForm.accountType || undefined,
                  pat: connectForm.pat || undefined,
                  ssh_private_key: connectForm.sshPrivateKey || undefined,
                })
              }
              disabled={connectMutation.isPending}
            >
              Save connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              Review runtime detection and deployment mode before SkyPort imports the repository and starts deployment.
            </DialogDescription>
          </DialogHeader>
          {selectedRepo ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Repository" value={selectedRepo.full_name} />
                <InfoRow label="Default branch" value={selectedRepo.default_branch || "main"} />
                <InfoRow label="Runtime" value={selectedRepo.runtime || "auto"} />
                <InfoRow label="Framework" value={selectedRepo.framework || "auto"} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Project name</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Deployment mode</Label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3" value={deploymentMode} onChange={(e) => setDeploymentMode(e.target.value as any)}>
                    <option value="docker">Docker</option>
                    <option value="native">Native</option>
                    <option value="pm2">PM2</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Working directory</Label>
                  <Input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="Optional repo subfolder" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Environment variables</Label>
                <Textarea value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder="KEY=value per line" className="min-h-32 font-mono text-xs" />
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="info">Suggested: {deploymentMode}</Badge>
                  <Badge variant="default">{selectedRepo.private ? "private repo" : "public repo"}</Badge>
                  <Badge variant="default">{selectedRepo.selected ? "selected" : "cached"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  SkyPort will clone the repository, persist the repo cache, create the project workspace, then use the deployment settings above for the next deployment step.
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              <Rocket className="mr-2 size-4" />
              Import and deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function parseEnvText(text: string) {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function InfoRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-foreground">{String(value)}</div>
    </div>
  );
}
