import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ArrowLeft, Upload, Download } from "lucide-react";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizablePanels } from "@/components/layout/ResizablePanels";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { CodeExplorerTree } from "@/features/code-editor/components/CodeExplorerTree";
import { FilePreview } from "@/features/code-editor/components/FilePreview";
import { platformApi } from "@/features/platform/api";
import { env } from "@/app/env";
import { useAuthStore } from "@/stores/authStore";

export function CodeEditorPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const [projectPath, setProjectPath] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState("");
  const [code, setCode] = React.useState("");
  const [explorerRoot, setExplorerRoot] = React.useState("");
  const [activeDirPath, setActiveDirPath] = React.useState("");
  const [customPath, setCustomPath] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [savedCode, setSavedCode] = React.useState("");
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

  const readFile = useMutation({
    mutationFn: platformApi.readFile,
    onSuccess: (res) => {
      const next = res.content ?? "";
      setCode(next);
      setSavedCode(next);
    },
  });

  const saveFile = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => platformApi.writeFile(path, content),
    onSuccess: (_res, vars) => {
      setSavedCode(vars.content);
      toast.success("File saved");
    },
    onError: () => toast.error("Save failed"),
  });

  const uploadFiles = useMutation({
    mutationFn: async ({ path, files }: { path: string; files: File[] }) => {
      for (const file of files) {
        await platformApi.uploadFile(path, file);
      }
      return files.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} file${count === 1 ? "" : "s"} uploaded`);
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
    },
    onError: () => toast.error("Upload failed"),
  });

  const selectedLanguage = React.useMemo(() => detectLanguage(selectedPath), [selectedPath]);
  const isDirty = !!selectedPath && !previewUrl && code !== savedCode;

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!selectedPath || !!previewUrl || saveFile.isPending || !isDirty) return;
        saveFile.mutate({ path: selectedPath, content: code });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [code, isDirty, previewUrl, saveFile, selectedPath]);

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
              setExplorerRoot(next);
              setActiveDirPath(next);
              setCustomPath(next);
              setSelectedPath("");
              setPreviewUrl("");
              setCode("");
              setSavedCode("");
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
              setExplorerRoot(p);
              setActiveDirPath(p);
              setSelectedPath("");
              setPreviewUrl("");
              setCode("");
              setSavedCode("");
            }}
          >
            Open custom path
          </Button>
          <Button variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["code-editor-files"] })} disabled={!explorerRoot}>
            Refresh
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (!files.length || !activeDirPath) return;
              uploadFiles.mutate({ path: activeDirPath, files });
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" onClick={() => uploadInputRef.current?.click()} disabled={!activeDirPath || uploadFiles.isPending}>
            <Upload className="size-4" />
            Upload
          </Button>
          <Button variant="outline" onClick={() => selectedPath && handleDownload(selectedPath, token)} disabled={!selectedPath}>
            <Download className="size-4" />
            Download
          </Button>
          <Button
            onClick={() => selectedPath && saveFile.mutate({ path: selectedPath, content: code })}
            disabled={!selectedPath || !!previewUrl || !isDirty}
          >
            Save file (Ctrl/Cmd+S)
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[68vh]">
            <ResizablePanels
              left={
                <div className="flex h-full flex-col border-r border-border/60">
                  <div className="shrink-0 mb-2 flex items-center gap-1 border-b border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                    <button
                      type="button"
                      className="rounded px-1 py-0.5 hover:bg-muted"
                      onClick={() => {
                        const next = parentFsPath(explorerRoot);
                        if (!next || next === explorerRoot) return;
                        setExplorerRoot(next);
                        setActiveDirPath(next);
                        setCustomPath(next);
                      }}
                      disabled={!explorerRoot}
                    >
                      Up
                    </button>
                    <ChevronRight className="size-3 shrink-0" />
                    <span className="truncate font-mono" title={activeDirPath || explorerRoot}>
                      {activeDirPath || explorerRoot || projectPath || "No folder selected"}
                    </span>
                  </div>
                  <div className="h-[calc(68vh-36px)] overflow-y-auto p-2" style={{ scrollbarGutter: 'stable' }}>
                    <CodeExplorerTree
                      rootPath={explorerRoot}
                      depth={0}
                      activeDirPath={activeDirPath}
                      selectedPath={selectedPath}
                      onOpenDirectory={(path) => {
                        setActiveDirPath(path);
                        setCustomPath(path);
                      }}
                      onOpenFile={(item) => {
                        setSelectedPath(item.path);
                        if (isPreviewable(item.path)) {
                          setPreviewUrl(buildPreviewUrl(item.path, token));
                          setCode("");
                          setSavedCode("");
                          return;
                        }
                        setPreviewUrl("");
                        readFile.mutate(item.path);
                      }}
                    />
                  </div>
                </div>
              }
              right={
                <div className="h-full">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate">{selectedPath || "No file selected"}</span>
                    <div className="flex items-center gap-2">
                      {selectedPath ? (
                        <Button size="sm" variant="outline" onClick={() => handleDownload(selectedPath, token)}>
                          <Download className="size-4" />
                          Download
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPath("");
                          setPreviewUrl("");
                          setCode("");
                          setSavedCode("");
                        }}
                      >
                        <ArrowLeft className="size-4" />
                        Back
                      </Button>
                    </div>
                  </div>
                  <div className="h-[calc(68vh-37px)]">
                    {previewUrl ? (
                      <FilePreview 
                        url={previewUrl} 
                        path={selectedPath} 
                        onDownload={() => handleDownload(selectedPath, token)} 
                      />
                    ) : (
                      <div className="h-full flex flex-col min-h-0">
                        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                          <span className="truncate">{selectedPath ? `Editing ${selectedPath}` : "Select a file to start editing"}</span>
                          <span>
                            {selectedLanguage.toUpperCase()} {isDirty ? "• unsaved" : "• saved"}
                          </span>
                        </div>
                        <div className="flex-1 overflow-hidden min-h-0">
                          <CodeEditor value={code} onChange={setCode} language={selectedLanguage} />
                        </div>
                      </div>
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

function parentFsPath(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  if (i > 0) {
    return normalized.slice(0, i);
  }
  if (normalized.includes(":")) {
    const head = normalized.split("/")[0];
    return head ? `${head}/` : normalized;
  }
  return "/";
}

function isPreviewable(path: string) {
  const p = path.toLowerCase();
  const previewExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
    ".pdf",
    ".docx", ".pptx", ".ppt",
    ".mp3", ".wav", ".ogg",
    ".mp4", ".mkv", ".webm"
  ];
  return previewExtensions.some(ext => p.endsWith(ext));
}
function buildPreviewUrl(path: string, token?: string | null) {
  const url = new URL(`${env.apiBaseUrl}/files/download`);
  url.searchParams.set("path", path);
  url.searchParams.set("inline", "1");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
function handleDownload(path: string, token?: string | null) {
  const url = new URL(`${env.apiBaseUrl}/files/download`);
  url.searchParams.set("path", path);
  if (token) url.searchParams.set("token", token);
  const a = document.createElement("a");
  a.href = url.toString();
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
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
