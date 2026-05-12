import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Folder, Upload, Download, ExternalLink } from "lucide-react";
import { getFileIcon } from "@/lib/fileIcons";
import * as XLSX from "xlsx";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizablePanels } from "@/components/layout/ResizablePanels";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformApi } from "@/features/platform/api";
import { env } from "@/app/env";
import { useAuthStore } from "@/stores/authStore";

export function FilesystemPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [pathInput, setPathInput] = React.useState("/");
  const [currentPath, setCurrentPath] = React.useState("/");
  const [selected, setSelected] = React.useState<string>("");
  const [value, setValue] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [previewMime, setPreviewMime] = React.useState<string>("");
  const [pdfUrl, setPdfUrl] = React.useState<string>("");
  const [imageUrl, setImageUrl] = React.useState<string>("");
  const [sheetRows, setSheetRows] = React.useState<string[][]>([]);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

  const listing = useQuery({
    queryKey: ["files", currentPath],
    queryFn: () => platformApi.listFiles(currentPath),
    retry: false,
  });

  const readFile = useMutation({
    mutationFn: platformApi.readFile,
    onSuccess: (res, pathArg) => {
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
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setValue("");
        setImageUrl("");
        setSheetRows([]);
        return;
      }
      if (res.preview && looksLikeSheet(pathArg)) {
        const wb = XLSX.read(res.preview, { type: "base64" });
        const first = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[first], { header: 1 }) as string[][];
        setSheetRows(rows.slice(0, 200));
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
          toast.success("Showing image preview via streaming");
          return;
        }
        if (looksLikePdf(filePath)) {
          setPdfUrl(previewUrl(filePath, token));
          toast.success("Showing PDF via streaming");
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
    mutationFn: async ({ path, files }: { path: string; files: File[] }) => {
      for (const file of files) {
        await platformApi.uploadFile(path, file);
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

  const handleDownload = React.useCallback(
    (targetPath: string) => {
      const url = downloadUrl(targetPath, token);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    },
    [token]
  );

  return (
    <PageShell className="max-w-350">
      <PageHeader title="Files" subtitle="Manage VPS disk files and edit text files" />

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
            <Input
              className="max-w-60"
              placeholder="new file/folder name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => createFolder.mutate(`${currentPath.replace(/\/$/, "")}/${newName}`)}
              disabled={!newName.trim()}
            >
              New folder
            </Button>
            <Button
              size="sm"
              onClick={() => createFile.mutate({ basePath: currentPath, filename: newName })}
              disabled={!newName.trim()}
            >
              New file
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (!files.length) return;
                uploadFiles.mutate({ path: currentPath, files });
                e.currentTarget.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadFiles.isPending}
            >
              <Upload className="size-4" />
              Upload
            </Button>
          </div>
          <div className="h-[70vh]">
            <ResizablePanels
              left={
                <div className="h-full bg-card">
                  <div className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
                    Explorer ({listing.data?.path ?? currentPath})
                  </div>
                  <div className="h-[calc(70vh-40px)] overflow-auto p-2">
                    {(listing.data?.items ?? []).map((item) => (
                      <div key={item.path} className="group flex w-full items-center gap-1 rounded-md hover:bg-muted">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                          onClick={() => {
                            if (item.is_dir) {
                              setCurrentPath(item.path);
                              setPathInput(item.path);
                              return;
                            }
                            setSelected(item.path);
                            setPdfUrl("");
                            setImageUrl("");
                            setSheetRows([]);
                            setValue("");
                            if (looksLikeImage(item.path)) {
                              setImageUrl(previewUrl(item.path, token));
                              return;
                            }
                            if (looksLikePdf(item.path)) {
                              setPdfUrl(previewUrl(item.path, token));
                              return;
                            }
                            readFile.mutate(item.path);
                          }}
                        >
                          {item.is_dir ? (
                            <Folder className="size-4 fill-primary/30 text-primary" />
                          ) : (
                            <span style={{ color: getFileIcon(item.name).color }}>{getFileIcon(item.name).icon}</span>
                          )}
                          <span className="truncate">{item.name}</span>
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="mr-1 size-7 opacity-70 group-hover:opacity-100"
                          onClick={() => handleDownload(item.path)}
                          title={item.is_dir ? "Download ZIP" : "Download file"}
                        >
                          <Download className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {!listing.data?.items?.length ? (
                      <div className="p-2 text-sm text-muted-foreground">No files found in this path.</div>
                    ) : null}
                  </div>
                </div>
              }
              right={
                <div className="h-full bg-card">
                  <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
                    <span>{selected || "Editor"}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected("")}>
                        Back
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => selected && handleDownload(selected)} disabled={!selected}>
                        <Download className="size-4" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => selected && writeFile.mutate({ filePath: selected, content: value })}
                        disabled={!selected || writeFile.isPending || !!pdfUrl || !!imageUrl || sheetRows.length > 0}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="h-[calc(70vh-40px)]">
                    {imageUrl ? (
                      <div className="flex h-full items-center justify-center overflow-auto bg-muted/20">
                        <img src={imageUrl} alt="File preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : pdfUrl ? (
                      <object data={pdfUrl} type="application/pdf" className="h-full w-full">
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                          <span>Inline PDF preview unavailable in this browser.</span>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}>
                              <ExternalLink className="size-4" />
                              Open in new tab
                            </Button>
                            <Button size="sm" onClick={() => selected && handleDownload(selected)} disabled={!selected}>
                              <Download className="size-4" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </object>
                    ) : sheetRows.length > 0 ? (
                      <div className="h-full overflow-auto p-3">
                        <div className="mb-2 text-xs text-muted-foreground">Excel preview (first sheet, first 200 rows)</div>
                        <table className="w-full border-collapse text-xs">
                          <tbody>
                            {sheetRows.map((row, idx) => (
                              <tr key={idx} className="border-b border-border/50">
                                {row.map((cell, cidx) => (
                                  <td key={cidx} className="max-w-80 truncate border-r border-border/30 px-2 py-1">
                                    {String(cell ?? "")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
    </PageShell>
  );
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
function parentPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized === "/" || /^[a-zA-Z]:\/?$/.test(normalized)) return normalized;
  const i = normalized.lastIndexOf("/");
  if (i <= 0) return "/";
  const p = normalized.slice(0, i);
  return p || "/";
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
