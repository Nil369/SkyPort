import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { File, Folder, FolderOpen, ChevronRight, ArrowLeft } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizablePanels } from "@/components/layout/ResizablePanels";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { platformApi } from "@/features/platform/api";
import { env } from "@/app/env";

export function CodeEditorPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const [projectPath, setProjectPath] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState("");
  const [code, setCode] = React.useState("");
  const [currentPath, setCurrentPath] = React.useState("");
  const [customPath, setCustomPath] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");

  const listing = useQuery({
    queryKey: ["code-editor-files", currentPath],
    queryFn: () => platformApi.listFiles(currentPath),
    enabled: !!currentPath,
  });

  const readFile = useMutation({
    mutationFn: platformApi.readFile,
    onSuccess: (res) => setCode(res.content ?? ""),
  });

  const saveFile = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => platformApi.writeFile(path, content),
  });

  return (
    <PageShell className="max-w-350">
      <PageHeader title="Code Editor" subtitle="Open project source code and edit files" />
      <Card>
        <CardHeader>
          <CardTitle>Select project</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 min-w-80 rounded-lg border border-input bg-background px-3 text-sm"
            value={projectPath}
            onChange={(e) => {
              const next = e.target.value;
              setProjectPath(next);
              setCurrentPath(next);
              setCustomPath(next);
              setSelectedPath("");
              setPreviewUrl("");
              setCode("");
            }}
          >
            <option value="">Choose project path</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.path}>
                {p.name} ({p.path})
              </option>
            ))}
          </select>
          <Input
            className="min-w-80"
            placeholder="Or enter custom absolute path"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              const p = customPath.trim();
              if (!p) return;
              setCurrentPath(p);
              setSelectedPath("");
              setPreviewUrl("");
              setCode("");
            }}
          >
            Open custom path
          </Button>
          <Button variant="outline" onClick={() => listing.refetch()} disabled={!currentPath}>
            Refresh
          </Button>
          <Button
            onClick={() => selectedPath && saveFile.mutate({ path: selectedPath, content: code })}
            disabled={!selectedPath || !!previewUrl}
          >
            Save file
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[68vh]">
            <ResizablePanels
              left={
                <div className="h-full overflow-auto border-r border-border/60 p-2">
                  <div className="mb-2 flex items-center gap-1 rounded-md border border-border/70 p-2 text-xs text-muted-foreground">
                    <button
                      className="rounded px-1 py-0.5 hover:bg-muted"
                      onClick={() => {
                        const normalized = currentPath.replace(/\\/g, "/");
                        const i = normalized.lastIndexOf("/");
                        const parent = i > 0 ? normalized.slice(0, i) : normalized.includes(":") ? normalized.split("/")[0] + "/" : "/";
                        const next = parent || "/";
                        setCurrentPath(next);
                        setCustomPath(next);
                      }}
                      disabled={!currentPath}
                    >
                      ..
                    </button>
                    <ChevronRight className="size-3" />
                    <span className="truncate">{currentPath || projectPath || "No folder selected"}</span>
                  </div>
                  {(listing.data?.items ?? []).map((item) => (
                    <button
                      key={item.path}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        if (item.is_dir) {
                          setCurrentPath(item.path);
                          setCustomPath(item.path);
                          return;
                        }
                        setSelectedPath(item.path);
                        if (isPreviewable(item.path)) {
                          setPreviewUrl(previewUrl(item.path));
                          setCode("");
                          return;
                        }
                        setPreviewUrl("");
                        readFile.mutate(item.path);
                      }}
                    >
                      {item.is_dir ? (
                        currentPath === item.path ? (
                          <FolderOpen className="size-4 fill-primary/30 text-primary" />
                        ) : (
                          <Folder className="size-4 fill-primary/30 text-primary" />
                        )
                      ) : (
                        <File className="size-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              }
              right={
                <div className="h-full">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate">{selectedPath || "No file selected"}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPath("");
                        setPreviewUrl("");
                        setCode("");
                      }}
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </Button>
                  </div>
                  <div className="h-[calc(68vh-37px)]">
                    {previewUrl ? (
                      selectedPath.toLowerCase().endsWith(".pdf") ? (
                        <iframe title="preview" src={previewUrl} className="h-full w-full" />
                      ) : (
                        <div className="flex h-full items-center justify-center overflow-auto bg-muted/20">
                          <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                        </div>
                      )
                    ) : (
                      <CodeEditor value={code} onChange={setCode} language={detectLanguage(selectedPath)} />
                    )}
                  </div>
                </div>
              }
            />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function isPreviewable(path: string) {
  const p = path.toLowerCase();
  return (
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".gif") ||
    p.endsWith(".webp") ||
    p.endsWith(".svg") ||
    p.endsWith(".pdf")
  );
}
function previewUrl(path: string) {
  return `${env.apiBaseUrl}/files/download?path=${encodeURIComponent(path)}&inline=1`;
}
function detectLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "typescript";
  if (["json"].includes(ext)) return "json";
  if (["md"].includes(ext)) return "markdown";
  if (["py"].includes(ext)) return "python";
  if (["css", "scss"].includes(ext)) return "css";
  if (["html", "htm"].includes(ext)) return "html";
  if (["yml", "yaml"].includes(ext)) return "yaml";
  if (["xml", "svg"].includes(ext)) return "xml";
  if (["sql"].includes(ext)) return "sql";
  return "typescript";
}
