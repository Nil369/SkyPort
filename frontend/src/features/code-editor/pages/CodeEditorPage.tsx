import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ArrowLeft, Upload, Download, FolderOpen, FolderPlus, SquareTerminal, FilePlus2, PencilLine, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ResizablePanels } from "@/components/layout/ResizablePanels";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { CodeExplorerTree } from "@/features/code-editor/components/CodeExplorerTree";
import { FilePreview } from "@/features/code-editor/components/FilePreview";
import { EditorTabBar } from "@/components/editor/EditorTabBar";
import { LanguageSelector } from "@/features/code-editor/components/LanguageSelector";
import { platformApi } from "@/features/platform/api";
import { env } from "@/app/env";
import { useAuthStore } from "@/stores/authStore";
import { useEditorTabStore } from "@/stores/editorTabStore";
import { TerminalEmulator } from "@/features/terminal/components/TerminalEmulator";
import { detectLanguageFromPath, getLanguageById } from "@/features/code-editor/languages/languageRegistry";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";

type ContextTarget = { path: string; name: string; isDir: boolean };

export function CodeEditorPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const projects = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const [projectPath, setProjectPath] = React.useState("");
  const [explorerRoot, setExplorerRoot] = React.useState("");
  const [activeDirPath, setActiveDirPath] = React.useState("");
  const [customPath, setCustomPath] = React.useState("");
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const [uploadTargetPath, setUploadTargetPath] = React.useState("");
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; item: ContextTarget } | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ContextTarget | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<ContextTarget | null>(null);
  const [newName, setNewName] = React.useState("");

  const { tabs, activeTabId, addTab, updateTab, closeAllTabs } = useEditorTabStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

  const readFile = useMutation({
    mutationFn: platformApi.readFile,
    onSuccess: (data, path) => {
      const tab = useEditorTabStore.getState().tabs.find(t => t.filePath === path);
      if (tab) {
        useEditorTabStore.getState().updateTab(tab.id, { content: data.content ?? "" });
      }
    }
  });

  const saveFile = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => platformApi.writeFile(path, content),
    onSuccess: (_res) => {
      if (activeTab?.id) {
        updateTab(activeTab.id, { isDirty: false });
      }
      toast.success("File saved");
    },
    onError: () => toast.error("Save failed"),
  });

  const createFile = useMutation({
    mutationFn: ({ basePath, filename }: { basePath: string; filename: string }) => platformApi.createFile(basePath, filename),
    onSuccess: () => {
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
    },
    onError: () => toast.error("Create file failed"),
  });

  const createFolder = useMutation({
    mutationFn: (path: string) => platformApi.createFolder(path),
    onSuccess: () => {
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
    },
    onError: () => toast.error("Create folder failed"),
  });

  const deleteFile = useMutation({
    mutationFn: (path: string) => platformApi.deleteFile(path),
    onSuccess: () => {
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const renameFile = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => platformApi.renameFile(oldPath, newPath),
    onSuccess: () => {
      setRenameTarget(null);
      setRenameValue("");
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
      toast.success("Renamed");
    },
    onError: () => toast.error("Rename failed"),
  });

  const uploadFiles = useMutation({
    mutationFn: async ({ path, files }: { path: string; files: { file: File; relativePath?: string }[] }) => {
      await Promise.all(files.map(({ file, relativePath }) => platformApi.uploadFile(path, file, { relativePath })));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["code-editor-files"] });
      toast.success("Files uploaded");
    },
    onError: () => toast.error("Upload failed"),
  });

  const selectedLanguage = React.useMemo(
    () => getLanguageById(activeTab?.language ?? detectLanguageFromPath(activeTab?.filePath ?? "").id),
    [activeTab?.filePath, activeTab?.language]
  );
  const isDirty = !!activeTab && !isPreviewable(activeTab.filePath) && activeTab.isDirty;

  const openUploadForPath = React.useCallback((path: string, includeFolder = false) => {
    setUploadTargetPath(path);
    if (includeFolder) {
      folderInputRef.current?.click();
      return;
    }
    uploadInputRef.current?.click();
  }, []);

  const openRenameDialog = React.useCallback((item: ContextTarget) => {
    setRenameTarget(item);
    setRenameValue(item.name);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!activeTab || isPreviewable(activeTab.filePath) || saveFile.isPending || !isDirty) return;
        saveFile.mutate({ path: activeTab.filePath, content: activeTab.content });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, isDirty, saveFile]);

  return (
    <PageShell className="max-w-350">
      <PageHeader
        title="Code Editor"
        subtitle="Open project source code, edit files, and toggle a workspace terminal below the editor."
      />

      <Card>
        <CardHeader>
          <CardTitle>Select project</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {/* <select
            className="h-9 min-w-80 rounded-lg border border-input bg-background px-3 text-sm"
            value={projectPath}
            onChange={(e) => {
              const next = e.target.value;
              setProjectPath(next);
              setExplorerRoot(next);
              setActiveDirPath(next);
              setCustomPath(next);
              closeAllTabs();
              setTerminalOpen(false);
            }}
          >
            <option value="">Choose project path</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.path}>
                {p.name} ({p.path})
              </option>
            ))}
          </select> */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="min-w-80 cursor-pointer justify-between"
              >
                <span className="truncate">
                  {projectPath
                    ? (() => {
                      const project =
                        projects.data?.find(
                          (p) =>
                            p.path ===
                            projectPath
                        );

                      return project
                        ? `${project.name} (${project.path})`
                        : projectPath;
                    })()
                    : "Choose project"}
                </span>

                <ChevronDown className="ml-2 size-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="start"
              className="w-105"
            >
              {(projects.data ?? []).length ===
                0 ? (
                <DropdownMenuItem disabled>
                  No projects found
                </DropdownMenuItem>
              ) : (
                (projects.data ?? []).map(
                  (p) => {
                    const isActive =
                      projectPath ===
                      p.path;

                    return (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => {
                          setProjectPath(
                            p.path
                          );

                          setExplorerRoot(
                            p.path
                          );

                          setActiveDirPath(
                            p.path
                          );

                          setCustomPath(
                            p.path
                          );

                          closeAllTabs();

                          setTerminalOpen(
                            false
                          );
                        }}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-md transition-colors ${isActive
                            ? "bg-blue-600 text-white hover:bg-blue-700 focus:bg-blue-700"
                            : ""
                          }`}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {p.name}
                          </span>

                          <span
                            className={`truncate text-xs ${isActive
                                ? "text-blue-100"
                                : "text-muted-foreground"
                              }`}
                          >
                            {p.path}
                          </span>
                        </div>

                        {isActive ? (
                          <Check className="size-4 shrink-0 text-white" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  }
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
              setProjectPath(p);
              closeAllTabs();
              setTerminalOpen(false);
            }}
          >
            Open custom path
          </Button>
          <Button variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["code-editor-files"] })} disabled={!explorerRoot}>
            Refresh
          </Button>
          <Input className="max-w-60" placeholder="new file/folder name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const basePath = activeDirPath || explorerRoot || projectPath;
              if (!basePath || !newName.trim()) return;
              createFolder.mutate(joinFsPath(basePath, newName.trim()));
            }}
            disabled={!newName.trim() || !explorerRoot}
          >
            <FolderPlus className="size-4" />
            New folder
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const basePath = activeDirPath || explorerRoot || projectPath;
              if (!basePath || !newName.trim()) return;
              createFile.mutate({ basePath, filename: newName.trim() });
            }}
            disabled={!newName.trim() || !explorerRoot}
          >
            <FilePlus2 className="size-4" />
            New file
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).map((file) => ({ file }));
              if (!files.length || !uploadTargetPath) return;
              uploadFiles.mutate({ path: uploadTargetPath, files });
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            multiple
            {...({ webkitdirectory: "true", directory: "true" } as any)}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).map((file) => ({
                file,
                relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
              }));
              if (!files.length || !uploadTargetPath) return;
              uploadFiles.mutate({ path: uploadTargetPath, files });
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" onClick={() => openUploadForPath(activeDirPath || explorerRoot || projectPath)} disabled={!explorerRoot || uploadFiles.isPending}>
            <Upload className="size-4" />
            Upload
          </Button>
          <Button variant="outline" onClick={() => openUploadForPath(activeDirPath || explorerRoot || projectPath, true)} disabled={!explorerRoot || uploadFiles.isPending}>
            <FolderOpen className="size-4" />
            Folder upload
          </Button>
          <Button variant="outline" onClick={() => activeTab && handleDownload(activeTab.filePath, token)} disabled={!activeTab}>
            <Download className="size-4" />
            Download
          </Button>
          <Button
            onClick={() => activeTab && saveFile.mutate({ path: activeTab.filePath, content: activeTab.content })}
            disabled={!activeTab || isPreviewable(activeTab.filePath) || !isDirty}
          >
            Save file (Ctrl/Cmd+S)
          </Button>
          <Button variant={terminalOpen ? "default" : "outline"} onClick={() => setTerminalOpen((value) => !value)} disabled={!explorerRoot}>
            <SquareTerminal className="size-4" />
            {terminalOpen ? "Hide terminal" : "Toggle terminal"}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-4 space-y-4">
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
                          setProjectPath(next);
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
                    <div className="h-[calc(70vh-40px)] overflow-y-auto p-2" style={{ scrollbarGutter: "stable" }}>
                      <CodeExplorerTree
                        rootPath={explorerRoot}
                        depth={0}
                        activeDirPath={activeDirPath}
                        selectedPath={activeTab?.filePath ?? ""}
                        onOpenDirectory={(path) => {
                          setActiveDirPath(path);
                          setCustomPath(path);
                        }}
                        onOpenFile={(item) => {
                          const isPreview = isPreviewable(item.path);
                          const lang = detectLanguageFromPath(item.path).id;

                          const existingTab = tabs.find(t => t.filePath === item.path);
                          addTab({
                            id: `tab-${item.path}`,
                            filePath: item.path,
                            fileName: item.name,
                            language: lang,
                            isDirty: false,
                            content: "",
                          });

                          if (!isPreview && !existingTab) {
                            readFile.mutate(item.path);
                          }
                        }}
                        onContextMenu={(item, x, y) => setContextMenu({ x, y, item: { path: item.path, name: item.name, isDir: item.is_dir } })}
                      />
                    </div>
                  </div>
                }
                right={
                  <div className="h-full">
                    <div className="flex flex-col h-full min-h-0">
                      {tabs.length > 0 ? (
                        <EditorTabBar
                          onNewFile={() => {
                            // Optional: trigger new file creation
                          }}
                        />
                      ) : null}
                      <div className="flex-1 min-h-0">
                        {activeTab && isPreviewable(activeTab.filePath) ? (
                          <FilePreview
                            url={buildPreviewUrl(activeTab.filePath, token)}
                            path={activeTab.filePath}
                            onDownload={() => handleDownload(activeTab.filePath, token)}
                          />
                        ) : activeTab ? (
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                              <span className="truncate">Editing {activeTab.fileName}</span>
                              <div className="flex items-center gap-2">
                                <LanguageSelector
                                  value={selectedLanguage.id}
                                  onChange={(nextLanguageId) => updateTab(activeTab.id, { language: nextLanguageId })}
                                />
                                <span>
                                  {isDirty ? "• unsaved" : "• saved"}
                                </span>
                              </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden">
                              <CodeEditor
                                value={activeTab.content}
                                onChange={(v) => updateTab(activeTab.id, { content: v, isDirty: true })}
                                language={selectedLanguage.id}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            Select a file to start editing
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                }
              />
            </div>
          </CardContent>
        </Card>

        {terminalOpen ? (
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
              <CardTitle className="text-base">Workspace terminal</CardTitle>
              <div className="text-xs text-muted-foreground truncate">{explorerRoot || projectPath || customPath || "No workspace selected"}</div>
            </CardHeader>
            <CardContent className="h-85 p-2 pt-0">
              <TerminalEmulator workingDirectory={explorerRoot || projectPath || customPath} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.isDir ? "folder" : "file"}</DialogTitle>
            <DialogDescription>Enter a new name. The item stays in its current parent folder.</DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="New name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!renameTarget || !renameValue.trim()) return;
                const nextPath = joinFsPath(parentFsPath(renameTarget.path), renameValue.trim());
                renameFile.mutate({ oldPath: renameTarget.path, newPath: nextPath });
              }}
              disabled={renameFile.isPending}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.isDir ? "folder" : "file"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name ?? "This item"} will be removed from the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteFile.mutate(deleteTarget.path);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-48 rounded-lg border border-border/80 bg-background p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { const isPreview = isPreviewable(contextMenu.item.path); const lang = detectLanguageFromPath(contextMenu.item.path).id; const existingTab = tabs.find(t => t.filePath === contextMenu.item.path); addTab({ id: `tab-${contextMenu.item.path}`, filePath: contextMenu.item.path, fileName: contextMenu.item.name, language: lang, isDirty: false, content: "" }); if (!isPreview && !existingTab) { readFile.mutate(contextMenu.item.path); } setContextMenu(null); }}>
            <ArrowLeft className="size-4" /> Open
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); openRenameDialog(contextMenu.item); }}>
            <PencilLine className="size-4" /> Rename
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); setDeleteTarget(contextMenu.item); }}>
            <Trash2 className="size-4" /> Delete
          </button>
          {contextMenu.item.isDir ? (
            <>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); const basePath = contextMenu.item.path; if (newName.trim()) createFile.mutate({ basePath, filename: newName.trim() }); }}>
                <FilePlus2 className="size-4" /> New file
              </button>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); const basePath = contextMenu.item.path; if (newName.trim()) createFolder.mutate(joinFsPath(basePath, newName.trim())); }}>
                <FolderPlus className="size-4" /> New folder
              </button>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); openUploadForPath(contextMenu.item.path); }}>
                <Upload className="size-4" /> Upload file
              </button>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setContextMenu(null); openUploadForPath(contextMenu.item.path, true); }}>
                <FolderOpen className="size-4" /> Upload folder
              </button>
            </>
          ) : null}
        </div>
      ) : null}
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

function joinFsPath(base: string, name: string) {
  const normalizedBase = base.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${normalizedBase}/${name}`;
}

function isPreviewable(path: string) {
  const p = path.toLowerCase();
  const previewExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
    ".pdf",
    ".docx", ".pptx", ".ppt",
    ".mp3", ".wav", ".ogg",
    ".mp4", ".mkv", ".webm",
    ".xlsx", ".xls", ".csv"
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
