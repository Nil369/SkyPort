import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import toast from "react-hot-toast";
import { ArrowLeft, CheckSquare, Download, FileSearch, Folder, FolderOpen, FolderPlus, PencilLine, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { env } from "@/app/env";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { ResizablePanels } from "@/components/layout/ResizablePanels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FilePreview } from "@/features/code-editor/components/FilePreview";
import { platformApi } from "@/features/platform/api";
import { useAuthStore } from "@/stores/authStore";
import { getFileIcon } from "@/lib/fileIcons";

type UploadEntry = { file: File; relativePath?: string };
type ContextMenuState = { x: number; y: number; path: string; isDir: boolean } | null;

export function FilesystemPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [pathInput, setPathInput] = React.useState("/");
  const [currentPath, setCurrentPath] = React.useState("/");
  const [selected, setSelected] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState("");
  const [value, setValue] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [previewMime, setPreviewMime] = React.useState("");
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [sheetRows, setSheetRows] = React.useState<string[][]>([]);
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(new Set());
  const [uploading, setUploading] = React.useState({ active: false, label: "", loaded: 0, total: 0 });
  const [dragActive, setDragActive] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ContextMenuState>(null);
  const [renameTarget, setRenameTarget] = React.useState<ContextMenuState>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedExt = selected.split(".").pop()?.toLowerCase() ?? "";
  const usesInEditorActions = ["docx", "xlsx", "xls", "csv"].includes(selectedExt);

  React.useEffect(() => {
    return () => {
      if (pdfUrl.startsWith("blob:")) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" && selectedPaths.size > 0) {
        event.preventDefault();
        if (confirm(`Delete ${selectedPaths.size} selected item(s)?`)) {
          deleteFiles.mutate(Array.from(selectedPaths));
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        uploadInputRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPaths]);

  React.useEffect(() => {
    const onClick = () => setContextMenu(null);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const listing = useQuery({
    queryKey: ["files", currentPath],
    queryFn: () => platformApi.listFiles(currentPath),
    retry: false,
  });

  const readFile = useMutation({
    mutationFn: platformApi.readFile,
    onSuccess: (res, filePath) => {
      setPreviewMime(res.content_type ?? "");
      if (res.content) {
        setValue(res.content);
        setPdfUrl("");
        setImageUrl("");
        setSheetRows([]);
        return;
      }
      if (res.preview && (res.content_type ?? "").includes("pdf")) {
        const binary = atob(res.preview);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
        setValue("");
        setImageUrl("");
        setSheetRows([]);
        return;
      }
      if (res.preview && looksLikeSheet(filePath)) {
        const wb = XLSX.read(res.preview, { type: "base64" });
        const first = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[first], { header: 1 }) as string[][];
        setSheetRows(rows);
        setValue("");
        setPdfUrl("");
        setImageUrl("");
        return;
      }
      setValue("");
      setPdfUrl("");
      setImageUrl("");
      setSheetRows([]);
    },
    onError: (err: any, filePath) => {
      const code = err?.response?.data?.error?.code;
      const msg = err?.response?.data?.error?.message ?? "Could not read file";
      if (code === "file_too_large") {
        if (looksLikeImage(filePath)) {
          setImageUrl(previewUrl(filePath, token));
          return;
        }
        if (looksLikePdf(filePath)) {
          setPdfUrl(previewUrl(filePath, token));
          return;
        }
      }
      toast.error(msg);
    },
  });

  const writeFile = useMutation({
    mutationFn: ({ filePath, content }: { filePath: string; content: string }) => platformApi.writeFile(filePath, content),
    onSuccess: () => toast.success("File saved"),
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Save failed"),
  });

  const createFile = useMutation({
    mutationFn: ({ basePath, filename }: { basePath: string; filename: string }) => platformApi.createFile(basePath, filename),
    onSuccess: () => {
      setNewName("");
      listing.refetch();
    },
  });

  const createFolder = useMutation({
    mutationFn: platformApi.createFolder,
    onSuccess: () => {
      setNewName("");
      listing.refetch();
    },
  });

  const uploadFiles = useMutation({
    mutationFn: async ({ path, files }: { path: string; files: UploadEntry[] }) => {
      let totalBytes = 0;
      for (const entry of files) totalBytes += entry.file.size;
      let completed = 0;
      setUploading({ active: true, label: "Preparing upload", loaded: 0, total: totalBytes });
      try {
        for (const entry of files) {
          await platformApi.uploadFile(path, entry.file, {
            relativePath: entry.relativePath,
            onUploadProgress: ({ loaded, total }) => {
              const currentTotal = total ?? entry.file.size;
              setUploading({
                active: true,
                label: entry.relativePath ? `Uploading ${entry.relativePath}` : `Uploading ${entry.file.name}`,
                loaded: completed + loaded,
                total: Math.max(totalBytes, completed + currentTotal),
              });
            },
          });
          completed += entry.file.size;
          setUploading({ active: true, label: entry.relativePath ? `Uploaded ${entry.relativePath}` : `Uploaded ${entry.file.name}`, loaded: completed, total: totalBytes });
        }
      } finally {
        setUploading({ active: false, label: "", loaded: 0, total: 0 });
      }
      return files.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} file${count === 1 ? "" : "s"} uploaded`);
      listing.refetch();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? "Upload failed");
    },
  });

  const deleteFiles = useMutation({
    mutationFn: async (paths: string[]) => {
      for (const path of paths) {
        await platformApi.deleteFile(path);
      }
    },
    onSuccess: () => {
      setSelectedPaths(new Set());
      setSelected("");
      listing.refetch();
      toast.success("Deleted");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Delete failed"),
  });

  const renameFile = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => platformApi.renameFile(oldPath, newPath),
    onSuccess: () => {
      setRenameTarget(null);
      setRenameValue("");
      listing.refetch();
      toast.success("Renamed");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Rename failed"),
  });

  const handleDownload = React.useCallback(
    (targetPath: string) => {
      const url = downloadUrl(targetPath, token);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    },
    [token],
  );

  const handleOpenItem = React.useCallback(
    (path: string, isDir: boolean) => {
      if (isDir) {
        setCurrentPath(path);
        setPathInput(path);
        setSelected("");
        return;
      }
      setSelected(path);
      setPdfUrl("");
      setImageUrl("");
      setSheetRows([]);
      setValue("");
      if (looksLikeImage(path)) {
        setImageUrl(previewUrl(path, token));
        return;
      }
      if (looksLikePdf(path)) {
        setPdfUrl(previewUrl(path, token));
        return;
      }
      if (looksLikePptx(path) || looksLikeVideo(path) || looksLikeSheet(path) || path.toLowerCase().endsWith(".docx") || path.toLowerCase().endsWith(".doc")) {
        return;
      }
      readFile.mutate(path);
    },
    [readFile, token, previewUrl],
  );

  const toggleSelectedPath = React.useCallback((path: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleUploadEntries = React.useCallback(
    (entries: UploadEntry[]) => {
      if (!entries.length) return;
      uploadFiles.mutate({ path: currentPath, files: entries });
    },
    [currentPath, uploadFiles],
  );

  const pathListing = listing.data?.items ?? [];

  return (
    <PageShell className="max-w-350">
      <PageHeader title="Files" subtitle="Manage VPS disk files, edit text files, and upload whole folder trees." />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-3">
            <Input value={pathInput} onChange={(e) => setPathInput(e.target.value)} placeholder="Absolute path, e.g. / or C:/" />
            <Button
              variant="outline"
              onClick={() => {
                setCurrentPath(pathInput.trim() || "/");
                setSelected("");
              }}
            >
              Open path
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const parent = parentPath(currentPath);
                setCurrentPath(parent);
                setPathInput(parent);
              }}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Input className="max-w-60" placeholder="new file/folder name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => createFolder.mutate(`${currentPath.replace(/\/$/, "")}/${newName}`)} disabled={!newName.trim()}>
              <FolderPlus className="size-4" />
              New folder
            </Button>
            <Button size="sm" onClick={() => createFile.mutate({ basePath: currentPath, filename: newName })} disabled={!newName.trim()}>
              New file
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).map((file) => ({ file }));
                handleUploadEntries(files);
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
                const files = Array.from(e.target.files ?? []).map((file) => ({ file, relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
                handleUploadEntries(files);
                e.currentTarget.value = "";
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => uploadInputRef.current?.click()} disabled={uploadFiles.isPending}>
              <Upload className="size-4" />
              Upload
            </Button>
            <Button size="sm" variant="secondary" onClick={() => folderInputRef.current?.click()} disabled={uploadFiles.isPending}>
              <FolderOpen className="size-4" />
              Folder upload
            </Button>
            {selectedPaths.size > 0 ? (
              <Button size="sm" variant="destructive" onClick={() => deleteFiles.mutate(Array.from(selectedPaths))} disabled={deleteFiles.isPending}>
                <Trash2 className="size-4" />
                Delete selected ({selectedPaths.size})
              </Button>
            ) : null}
          </div>
          {uploading.active ? (
            <div className="border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate">{uploading.label}</span>
                <span>{uploading.total > 0 ? `${Math.round((uploading.loaded / uploading.total) * 100)}%` : "…"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: uploading.total > 0 ? `${Math.min(100, (uploading.loaded / uploading.total) * 100)}%` : "35%" }} />
              </div>
            </div>
          ) : null}
          <div className="h-[70vh]">
            <ResizablePanels
              left={
                <div
                  className={`flex h-full flex-col bg-card border-r border-border/60 ${dragActive ? "ring-2 ring-primary/40 ring-inset" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const files = Array.from(e.dataTransfer.files ?? []).map((file) => ({
                      file,
                      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
                    }));
                    handleUploadEntries(files);
                  }}
                >
                  <div className="shrink-0 border-b border-border/70 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                    Explorer ({listing.data?.path ?? currentPath})
                  </div>
                  <div className="h-[calc(70vh-40px)] overflow-y-auto p-2" style={{ scrollbarGutter: "stable" }}>
                    {pathListing.map((item) => (
                      <div
                        key={item.path}
                        className="group flex w-full items-center gap-1 rounded-md hover:bg-muted"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, path: item.path, isDir: item.is_dir });
                        }}
                      >
                        <button
                          className="ml-1 size-7 rounded border border-border/60 text-muted-foreground hover:bg-muted"
                          onClick={() => toggleSelectedPath(item.path)}
                          title="Select"
                        >
                          {selectedPaths.has(item.path) ? <CheckSquare className="mx-auto size-4 text-primary" /> : <div className="mx-auto size-4 rounded-sm border border-muted-foreground/40" />}
                        </button>
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                          onClick={() => handleOpenItem(item.path, item.is_dir)}
                        >
                          {item.is_dir ? <Folder className="size-4 fill-primary/30 text-primary" /> : <span style={{ color: getFileIcon(item.name).color }}>{getFileIcon(item.name).icon}</span>}
                          <span className="truncate">{item.name}</span>
                        </button>
                        {!item.is_dir ? (
                          <Button size="icon" variant="ghost" className="mr-1 size-7 opacity-70 group-hover:opacity-100" onClick={() => setPreviewPath(item.path)} title="Quick preview">
                            <FileSearch className="size-4" />
                          </Button>
                        ) : null}
                        <Button size="icon" variant="ghost" className="mr-1 size-7 opacity-70 group-hover:opacity-100" onClick={() => handleDownload(item.path)} title={item.is_dir ? "Download ZIP" : "Download file"}>
                          <Download className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="mr-1 size-7 opacity-70 group-hover:opacity-100"
                          onClick={() => setDeleteTarget({ x: 0, y: 0, path: item.path, isDir: item.is_dir })}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {!pathListing.length ? <div className="p-2 text-sm text-muted-foreground">No files found in this path.</div> : null}
                  </div>
                </div>
              }
              right={
                <div className="h-full bg-card">
                  <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
                    <span>{selected || "Editor"}</span>
                    {!usesInEditorActions && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected("")}>Back</Button>
                        <Button size="sm" variant="outline" onClick={() => selected && handleDownload(selected)} disabled={!selected}>
                          <Download className="size-4" />
                          Download
                        </Button>
                        {selected ? (
                          <Button size="sm" variant="outline" onClick={() => setPreviewPath(selected)}>
                            Preview
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => selected && writeFile.mutate({ filePath: selected, content: value })} disabled={!selected || writeFile.isPending || !!pdfUrl || !!imageUrl || sheetRows.length > 0}>
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="h-[calc(70vh-40px)]">
                    {selected && isPreviewable(selected) ? (
                      <FilePreview url={pdfUrl || imageUrl || previewUrl(selected, token)} path={selected} onDownload={() => handleDownload(selected)} />
                    ) : sheetRows.length > 0 ? (
                      <SheetVirtualizer rows={sheetRows} />
                    ) : (
                      <CodeEditor value={value} onChange={setValue} language={detectLanguage(selected, previewMime)} />
                    )}
                  </div>
                </div>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewPath)} onOpenChange={(open) => !open && setPreviewPath("")}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>{previewPath}</DialogDescription>
          </DialogHeader>
          {previewPath ? (
            <div className="min-h-[60vh] overflow-hidden rounded-lg border border-border/70">
              <FilePreview url={previewUrl(previewPath, token)} path={previewPath} onDownload={() => handleDownload(previewPath)} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewPath("")}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contextMenu ? (
        <div className="fixed z-50 min-w-40 rounded-lg border border-border/80 bg-background p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(e) => e.preventDefault()}>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { handleDownload(contextMenu.path); setContextMenu(null); }}>
            <Download className="size-4" /> Download
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setRenameTarget(contextMenu); setRenameValue(contextMenu.path.split(/[/\\]/).pop() ?? ""); setContextMenu(null); }}>
            <PencilLine className="size-4" /> Rename
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setPreviewPath(contextMenu.path); setContextMenu(null); }}>
            <FileSearch className="size-4" /> Preview
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => { setDeleteTarget(contextMenu); setContextMenu(null); }}>
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      ) : null}

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.isDir ? "folder" : "file"}</DialogTitle>
            <DialogDescription>Choose a new name for this item.</DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!renameTarget || !renameValue.trim()) return;
                const nextPath = joinFsPath(parentPath(renameTarget.path), renameValue.trim());
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
            <AlertDialogDescription>{deleteTarget?.path ?? "This item"} will be removed from the workspace.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) deleteFiles.mutate([deleteTarget.path]); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function isPreviewable(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf", "docx", "pptx", "ppt", "mp3", "wav", "ogg", "mp4", "mkv", "webm", "mov", "ogv", "xlsx", "xls", "csv"].includes(ext);
}

function looksLikeSheet(path: string) {
  const p = path.toLowerCase();
  return p.endsWith(".xlsx") || p.endsWith(".xls") || p.endsWith(".csv");
}
function looksLikeImage(path: string) {
  const p = path.toLowerCase();
  return p.endsWith(".png") || p.endsWith(".jpg") || p.endsWith(".jpeg") || p.endsWith(".gif") || p.endsWith(".webp") || p.endsWith(".svg");
}
function looksLikePdf(path: string) {
  return path.toLowerCase().endsWith(".pdf");
}
function looksLikePptx(path: string) {
  const p = path.toLowerCase();
  return p.endsWith(".pptx") || p.endsWith(".ppt");
}
function looksLikeVideo(path: string) {
  const p = path.toLowerCase();
  return p.endsWith(".mp4") || p.endsWith(".webm") || p.endsWith(".mkv") || p.endsWith(".mov") || p.endsWith(".ogv");
}
function parentPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized === "/" || /^[a-zA-Z]:\/?$/.test(normalized)) return normalized;
  const i = normalized.lastIndexOf("/");
  if (i <= 0) return "/";
  const p = normalized.slice(0, i);
  return p || "/";
}

function joinFsPath(base: string, name: string) {
  const normalizedBase = base.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${normalizedBase}/${name}`;
}
function previewUrl(path: string, token?: string | null) {
  const url = new URL(`${env.apiBaseUrl}/files/download`);
  url.searchParams.set("path", path);
  url.searchParams.set("inline", "1");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
function downloadUrl(path: string, token?: string | null) {
  const url = new URL(`${env.apiBaseUrl}/files/download`);
  url.searchParams.set("path", path);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
function detectLanguage(path: string, mime: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("json") || ext === "json") return "json";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "typescript";
  if (["md"].includes(ext)) return "markdown";
  if (["py"].includes(ext)) return "python";
  if (["css", "scss"].includes(ext)) return "css";
  if (["html", "htm"].includes(ext)) return "html";
  if (["yml", "yaml"].includes(ext)) return "yaml";
  if (["xml", "svg"].includes(ext)) return "xml";
  if (["sql"].includes(ext)) return "sql";
  return "markdown";
}

function SheetVirtualizer({ rows }: { rows: (string | number | boolean | Date | null | undefined)[][] }) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="h-full overflow-hidden flex flex-col p-3">
      <div className="mb-2 text-xs text-muted-foreground shrink-0">Excel preview ({rows.length} total rows)</div>
      <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        <table className="w-full border-collapse text-xs">
          <tbody style={{ height: `${totalSize}px`, position: 'relative' }}>
            {virtualItems.map(virtualItem => (
              <tr
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  display: 'table',
                  tableLayout: 'fixed',
                }}
                className="border-b border-border/50 hover:bg-muted/50 transition-colors"
              >
                <td className="px-2 py-1 text-xs text-muted-foreground min-w-12 text-right pr-4 border-r border-border/30 sticky left-0 bg-muted/20">
                  {virtualItem.index + 1}
                </td>
                {rows[virtualItem.index]?.map((cell, cidx) => (
                  <td
                    key={cidx}
                    className="max-w-80 truncate border-r border-border/30 px-2 py-1"
                    title={String(cell ?? '')}
                  >
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
