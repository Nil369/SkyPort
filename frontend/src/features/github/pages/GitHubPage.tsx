import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ExternalLink, Import, RefreshCw, Search, ShieldCheck } from "lucide-react";
import StackIcon from "tech-stack-icons";
import * as simpleIcons from "simple-icons";
import { useLocation } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { platformApi, type GitHubRepository } from "@/features/platform/api";

type GitHubConnectInput = Parameters<typeof platformApi.githubConnect>[0];
type GitHubConnectionSummary = {
  auth_type?: "app" | "pat" | "ssh";
  connected?: boolean;
};

export function GitHubPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const [query, setQuery] = React.useState("");
  const [tableQuery, setTableQuery] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const perPage = 10;
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [selectedRepo, setSelectedRepo] = React.useState<GitHubRepository | null>(null);
  const [branch, setBranch] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [gitAuthType, setGitAuthType] = React.useState<"app" | "pat" | "ssh">("pat");
  const callbackInstallationId = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("installation_id")?.trim() ?? "";
    return raw && Number.isFinite(Number(raw)) && Number(raw) !== 0 ? raw : "";
  }, [location.search]);
  // Keep detected installation id in localStorage so a refresh doesn't lose it
  React.useEffect(() => {
    try {
      if (callbackInstallationId) {
        localStorage.setItem("skyport.github_installation_id", callbackInstallationId);
        setConnectForm((prev) => ({ ...prev, installationId: callbackInstallationId }));
      } else {
        const saved = localStorage.getItem("skyport.github_installation_id") ?? "";
        if (saved && !connectForm.installationId) {
          setConnectForm((prev) => ({ ...prev, installationId: saved }));
        }
      }
    } catch (e) {
      // ignore storage errors (e.g., incognito restrictions)
    }
  }, [callbackInstallationId]);
  const autoConnectRef = React.useRef<string>("");
  const [connectForm, setConnectForm] = React.useState({
    authType: "app" as "app" | "pat" | "ssh",
    installationId: "",
    pat: "",
    sshPrivateKey: "",
  });

  const installQuery = useQuery({ queryKey: ["github", "install"], queryFn: platformApi.githubInstall });
  const setupQuery = useQuery({ queryKey: ["github", "setup"], queryFn: platformApi.githubSetup });
  const hasAppConfig = Boolean(setupQuery.data?.setup?.has_app_config);
  const connections = React.useMemo(
    () => (setupQuery.data?.connections ?? []) as GitHubConnectionSummary[],
    [setupQuery.data?.connections],
  );
  const connectedGitHubApp = React.useMemo(
    () => connections.find((c) => c.connected && c.auth_type === "app"),
    [connections],
  );
  const gitCreds = useQuery({ queryKey: ["git-credentials"], queryFn: platformApi.getGitCredentials });
  const reposQuery = useQuery({
    queryKey: ["github", "repositories", query, ownerFilter, page, gitCreds.data?.git_auth_type, gitCreds.data?.has_pat, gitCreds.data?.has_ssh_key],
    queryFn: () =>
      platformApi.githubRepositories({
        q: query.trim() || undefined,
        refresh: Boolean(hasAppConfig || gitCreds.data?.has_pat),
        page,
        per_page: perPage,
      }),
  });

  React.useEffect(() => {
    if (connectedGitHubApp) return;
    if (gitCreds.data?.git_auth_type) {
      setGitAuthType(gitCreds.data.git_auth_type);
    }
  }, [connectedGitHubApp, gitCreds.data?.git_auth_type]);

  React.useEffect(() => {
    const connection = connections.find((c) => c.connected);
    if (connection?.auth_type === "app" || connection?.auth_type === "pat" || connection?.auth_type === "ssh") {
      setGitAuthType(connection.auth_type);
    }
  }, [connections]);

  const connectMutation = useMutation({
    mutationFn: async (input: GitHubConnectInput) => {
      const result = await platformApi.githubConnect(input);
      if (input.auth_type === "pat" || input.auth_type === "ssh") {
        await platformApi.updateGitCredentials({
          git_auth_type: input.auth_type,
          git_pat: input.auth_type === "pat" ? input.pat : undefined,
          git_ssh_key: input.auth_type === "ssh" ? input.ssh_private_key : undefined,
        });
      }
      return result;
    },
    onSuccess: async () => {
      toast.success("GitHub connection saved");
      setConnectOpen(false);
      setConnectForm((prev) => ({ ...prev, pat: "", sshPrivateKey: "" }));
      try { localStorage.removeItem("skyport.github_installation_id"); } catch (e) {}
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["github", "setup"] }),
        qc.invalidateQueries({ queryKey: ["github", "install"] }),
        qc.invalidateQueries({ queryKey: ["github", "repositories"] }),
        qc.invalidateQueries({ queryKey: ["git-credentials"] }),
      ]);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Connection failed"),
  });

  React.useEffect(() => {
    if (!hasAppConfig) return;
    const detected = callbackInstallationId || connectForm.installationId || (() => {
      try { return localStorage.getItem("skyport.github_installation_id") ?? "" } catch { return "" }
    })();
    if (!detected) return;
    if (autoConnectRef.current === detected) return;
    if (connectMutation.isPending) return;

    autoConnectRef.current = detected;
    setConnectForm((prev) => ({ ...prev, authType: "app", installationId: detected }));
    connectMutation.mutate({
      auth_type: "app",
      installation_id: Number(detected),
    });
  }, [callbackInstallationId, connectForm.installationId, connectMutation, hasAppConfig]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRepo) throw new Error("No repository selected");
      const authType = hasAppConfig && selectedRepo.installation_id ? "app" : gitAuthType;
      const imported = await platformApi.githubImport({
        installation_id: selectedRepo.installation_id,
        repository_id: selectedRepo.repository_id,
        full_name: selectedRepo.full_name,
        name: selectedRepo.name,
        owner: selectedRepo.owner,
        clone_url: selectedRepo.clone_url,
        ssh_url: selectedRepo.ssh_url,
        branch: branch.trim() || selectedRepo.selected_branch || selectedRepo.default_branch,
        project_name: projectName.trim() || selectedRepo.name,
        auth_type: authType,
        selected: true,
      });

      return imported;
    },
    onSuccess: async (imported) => {
      toast.success(`Imported ${imported.repository.full_name} to Projects`);
      setPreviewOpen(false);
      setSelectedRepo(null);
      setProjectName("");
      setBranch("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
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

  const tableRepositories = React.useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    if (!q) return repositories;
    return repositories.filter((repo) => {
      return (
        repo.full_name.toLowerCase().includes(q) ||
        repo.name.toLowerCase().includes(q) ||
        repo.owner.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q) ||
        (repo.language ?? "").toLowerCase().includes(q) ||
        (repo.framework ?? "").toLowerCase().includes(q) ||
        (repo.runtime ?? "").toLowerCase().includes(q) ||
        (repo.selected_branch || repo.default_branch || "").toLowerCase().includes(q)
      );
    });
  }, [repositories, tableQuery]);

  const setup = setupQuery.data?.setup;
  const installUrl = installQuery.data?.install ?? setup?.app_install_url ?? "https://github.com/apps/skyportdeploy/installations/new";

  React.useEffect(() => {
    if (!connectOpen || hasAppConfig) return;
    setConnectForm((prev) => (prev.authType === "app" ? { ...prev, authType: "pat" } : prev));
  }, [connectOpen, hasAppConfig]);

  return (
    <PageShell>
      <PageHeader
        title="GitHub"
        subtitle="Connect a GitHub App installation or fallback credentials, browse repositories, and import them into SkyPort projects."
        right={
            <div className="flex flex-wrap gap-2">
              {connections.some((c) => c.connected) ? (
                <Button variant="secondary" onClick={() => setConnectOpen(true)}>
                  <StackIcon name="github" variant="dark" className="mr-2 size-4" />
                  Connected
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setConnectOpen(true)}>
                  <StackIcon name="github" variant="dark" className="mr-2 size-4" />
                  Connect GitHub
                </Button>
              )}
            <Button asChild>
              <a href={installUrl} target="_blank" rel="noreferrer">
                <StackIcon name="github" variant="dark" className="mr-2 size-4" />
                Install GitHub App
              </a>
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
            <Badge variant={hasAppConfig ? "success" : "warning"}>{hasAppConfig ? "GitHub App configured" : "PAT/SSH fallback"}</Badge>
            <Badge variant="info">{setup?.recommended_mode ?? "docker"} recommended</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {hasAppConfig
              ? "Open the install URL, complete the GitHub App installation, then save the installation ID here."
              : "Connect once with a PAT or SSH key to list and import repositories."}
          </div>
          <a className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" href={installUrl} target="_blank" rel="noreferrer">
            Open install URL <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Prev
          </Button>
          <div className="text-sm text-muted-foreground">Page {page}</div>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={(reposQuery.data ?? []).length < perPage}>
            Next
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
        <div className="border-b border-border/60 bg-background/80 p-3">
          <div className="flex max-w-md items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Search table rows..."
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Repository</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Runtime</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {tableRepositories.map((repo) => {
                const githubUrl = githubRepoUrl(repo.full_name);
                return (
                  <tr key={repo.id || repo.repository_id || repo.full_name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 align-top">
                      <a href={githubUrl} target="_blank" rel="noreferrer" className="group inline-flex max-w-md items-center gap-2 font-medium text-foreground hover:text-primary">
                        <span className="min-w-0 truncate">{repo.full_name}</span>
                        <ExternalLink className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                      </a>
                      <div className="mt-1 max-w-lg truncate text-xs text-muted-foreground">{repo.description || "No description provided"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {repo.language ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium">
                          <LanguageIcon language={repo.language} />
                          <span>{repo.language}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          <LanguageIcon language="Unknown" />
                          <span>Unknown</span>
                        </div>
                      )}
                      {repo.framework ? <div className="mt-1 text-xs text-muted-foreground">{repo.framework}</div> : null}
                    </td>
                    <td className="px-4 py-3 align-top text-sm">{repo.selected_branch || repo.default_branch || "main"}</td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={repo.private ? "warning" : "success"}>{repo.private ? "Private" : "Public"}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-muted-foreground">{repo.runtime || "auto"}</td>
                    <td className="px-4 py-3 align-top text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedRepo(repo);
                          setProjectName(repo.name);
                          setBranch(repo.selected_branch || repo.default_branch || "main");
                          setPreviewOpen(true);
                        }}
                      >
                        <Import className="mr-2 size-4" />
                        Import
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!tableRepositories.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                    No repositories match this table search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect GitHub</DialogTitle>
            <DialogDescription>
              Connect once. SkyPort reuses this for repository listing, private imports, and Projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Connection method</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={connectForm.authType}
                onChange={(e) => setConnectForm((prev) => ({ ...prev, authType: e.target.value as "app" | "pat" | "ssh" }))}
              >
                {hasAppConfig ? <option value="app">GitHub App</option> : null}
                <option value="pat">Personal access token (PAT)</option>
                <option value="ssh">SSH key</option>
              </select>
            </div>
            {connectForm.authType === "app" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/60 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">GitHub App installation</div>
                    <div className="text-xs text-muted-foreground">Open the install page, authorize the app, then return to SkyPort. The callback is detected automatically.</div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={installUrl} target="_blank" rel="noreferrer" className="bg-primary/80 text-white">
                      <StackIcon name="github" variant="dark" className="size-5 shrink-0" />
                      Open install page
                    </a>
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Installation ID</Label>
                  <Input value={connectForm.installationId || callbackInstallationId} readOnly placeholder="Detected automatically after install" />
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  GitHub App install URL: <a href={installUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{installUrl}</a>
                  {callbackInstallationId ? <div className="mt-1 text-foreground">Detected installation callback: {callbackInstallationId}</div> : null}
                </div>
              </div>
            ) : null}
            {connectForm.authType === "pat" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>GitHub PAT</Label>
                  <Input
                    value={connectForm.pat}
                    onChange={(e) => setConnectForm((prev) => ({ ...prev, pat: e.target.value }))}
                    placeholder="Paste a token with repo access"
                  />
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">How to create a PAT</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    <li>Open GitHub settings, then Developer settings.</li>
                    <li>Create a Personal access token. Fine-grained tokens should allow repository contents read access; classic tokens need repo access for private repos.</li>
                    <li>Paste the token here once. SkyPort stores it and reuses it for imports.</li>
                  </ol>
                </div>
              </div>
            ) : null}
            {connectForm.authType === "ssh" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>SSH private key</Label>
                  <Textarea
                    value={connectForm.sshPrivateKey}
                    onChange={(e) => setConnectForm((prev) => ({ ...prev, sshPrivateKey: e.target.value }))}
                    placeholder="Paste the private SSH key"
                    className="min-h-36 font-mono text-xs"
                  />
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Add the matching public key in GitHub settings under SSH and GPG keys, then paste only the private key here.
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setGitAuthType(connectForm.authType);
                connectMutation.mutate({
                  auth_type: connectForm.authType,
                  installation_id: connectForm.authType === "app" && connectForm.installationId ? Number(connectForm.installationId) : undefined,
                  pat: connectForm.authType === "pat" ? connectForm.pat.trim() : undefined,
                  ssh_private_key: connectForm.authType === "ssh" ? connectForm.sshPrivateKey : undefined,
                });
              }}
              disabled={
                connectMutation.isPending ||
                (connectForm.authType === "app" && (!hasAppConfig || !connectForm.installationId)) ||
                (connectForm.authType === "pat" && !connectForm.pat.trim()) ||
                (connectForm.authType === "ssh" && !connectForm.sshPrivateKey.trim())
              }
            >
              Save connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import repository</DialogTitle>
            <DialogDescription>
              Import this repository into the Projects section. Deployment is handled separately after the project is created.
            </DialogDescription>
          </DialogHeader>
          {selectedRepo ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Repository" value={selectedRepo.full_name} />
                <InfoRow label="Default branch" value={selectedRepo.default_branch || "main"} />
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Project name</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Repository URL</Label>
                  <Input value={githubRepoUrl(selectedRepo.full_name)} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Input value={selectedRepo.language || "Unknown"} readOnly />
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="default">{selectedRepo.private ? "private repo" : "public repo"}</Badge>
                  <Badge variant="default">{selectedRepo.selected ? "selected" : "cached"}</Badge>
                  <Badge variant="info">{hasAppConfig && selectedRepo.installation_id ? "GitHub App auth" : `${gitAuthType.toUpperCase()} auth`}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  This will create a project entry in SkyPort and import the repository into the Projects section only.
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              <Import className="mr-2 size-4" />
              Import to Projects
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-foreground">{String(value)}</div>
    </div>
  );
}

function githubRepoUrl(fullName: string) {
  return `https://github.com/${fullName.replace(/^\/+|\/+$/g, "")}`;
}

function LanguageIcon({ language }: { language: string }) {
  const icon = resolveLanguageIcon(language);
  if (icon.kind === "stack") {
    return <StackIcon name={icon.name as any} variant="dark" className="size-4 shrink-0" />;
  }
  if (icon.kind === "simple") {
    return (
      <svg
        role="img"
        aria-label={language}
        viewBox="0 0 24 24"
        className="size-4 shrink-0"
        fill={`#${icon.hex}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={icon.path} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-muted-foreground"
    >
      {icon.label}
    </span>
  );
}

type LanguageIconSpec =
  | { kind: "stack"; name: string }
  | { kind: "simple"; path: string; hex: string }
  | { kind: "generic"; label: string };

function resolveLanguageIcon(language: string): LanguageIconSpec {
  const key = normalizeLanguageKey(language);
  const techStackIcons: Record<string, string> = {
    javascript: "js",
    typescript: "typescript",
    python: "python",
    go: "go",
    golang: "go",
    java: "java",
    php: "php",
    ruby: "ruby",
    rust: "rust",
    html: "html5",
    css: "css3",
    dockerfile: "docker",
    vue: "vuejs",
    node: "nodejs2",
    nodejs: "nodejs2",
  };
  const simpleIconNames: Record<string, string> = {
    c: "siC",
    cpp: "siCplusplus",
    cplusplus: "siCplusplus",
    csharp: "siCsharp",
    ejs: "siEjs",
    shell: "siGnubash",
    sh: "siGnubash",
    bash: "siGnubash",
    powershell: "siPowershell",
    jupyter: "siJupyter",
    jupyternotebook: "siJupyter",
    mdx: "siMdx",
    markdown: "siMarkdown",
    objectivec: "siC",
    scala: "siScala",
    swift: "siSwift",
    kotlin: "siKotlin",
    dart: "siDart",
    r: "siR",
    lua: "siLua",
    perl: "siPerl",
    haskell: "siHaskell",
    elixir: "siElixir",
    clojure: "siClojure",
    zig: "siZig",
    svelte: "siSvelte",
    astro: "siAstro",
    solidity: "siSolidity",
    terraform: "siTerraform",
    json: "siJson",
    yaml: "siYaml",
    yml: "siYaml",
    unknown: "siGit",
  };

  const stackName = techStackIcons[key];
  if (stackName) return { kind: "stack", name: stackName };

  const simpleName = simpleIconNames[key];
  const iconData = simpleName ? (simpleIcons as any)[simpleName] : null;
  if (iconData?.path && iconData?.hex) {
    return { kind: "simple", path: iconData.path, hex: iconData.hex };
  }

  return { kind: "generic", label: language.trim().slice(0, 1).toUpperCase() || "?" };
}

function normalizeLanguageKey(language: string) {
  return language.toLowerCase().replace(/[\s_#+.-]/g, "");
}
