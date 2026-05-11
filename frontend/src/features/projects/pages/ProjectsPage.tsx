import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: platformApi.listProjects,
  });

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
            placeholder="Git URL (optional)"
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
              {(projects.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.path}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.gitURL ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm" onClick={() => deleteProject.mutate(p.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!projects.data?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No projects yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
