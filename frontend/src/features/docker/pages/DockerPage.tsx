import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, ImagePlus, Layers, Network, Play, Square, Trash2 } from "lucide-react";
import { useLocation } from "react-router";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";

export function DockerPage() {
  const status = useQuery({ queryKey: ["docker-status"], queryFn: platformApi.dockerStatus });
  const containers = useQuery({ queryKey: ["docker-containers"], queryFn: platformApi.listContainers });
  const images = useQuery({ queryKey: ["docker-images"], queryFn: platformApi.listImages });
  const volumes = useQuery({
    queryKey: ["docker-volumes"],
    queryFn: platformApi.listDockerVolumes,
    enabled: Boolean(status.data?.daemon_running),
  });
  const networks = useQuery({
    queryKey: ["docker-networks"],
    queryFn: platformApi.listDockerNetworks,
    enabled: Boolean(status.data?.daemon_running),
  });
  const [dockerTab, setDockerTab] = React.useState<"containers" | "images" | "volumes" | "networks">("containers");
  const [installNote, setInstallNote] = React.useState<string | null>(null);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const daemon = useMutation({ mutationFn: platformApi.dockerDaemon, onSuccess: () => status.refetch() });
  const dockerInstall = useMutation({
    mutationFn: platformApi.dockerInstall,
    onSuccess: (data: any) => {
      setInstallError(null);
      if (data?.install) {
        setInstallNote(String(data.install));
        toast.success("Install command ready");
      } else if (data?.executed) {
        setInstallNote(null);
        toast.success("Docker install started");
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? "Docker install failed";
      setInstallError(msg);
      toast.error("Docker install failed. See details below.");
    },
  });
  const startContainer = useMutation({
    mutationFn: platformApi.startContainer,
    onSuccess: () => containers.refetch(),
  });
  const stopContainer = useMutation({
    mutationFn: platformApi.stopContainer,
    onSuccess: () => containers.refetch(),
  });
  const deleteContainer = useMutation({
    mutationFn: platformApi.deleteContainer,
    onSuccess: () => containers.refetch(),
  });
  const commitContainer = useMutation({
    mutationFn: ({ name, repository, tag }: { name: string; repository: string; tag?: string }) =>
      platformApi.commitContainer(name, repository, tag),
    onSuccess: () => {
      toast.success("Image created from container");
      images.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Commit failed"),
  });
  const deleteImage = useMutation({
    mutationFn: platformApi.deleteImage,
    onSuccess: () => images.refetch(),
  });
  const runImage = useMutation({
    mutationFn: ({ image, name, port }: { image: string; name?: string; port?: number }) =>
      platformApi.runImage(image, name, port),
    onSuccess: () => {
      toast.success("Container created");
      containers.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Run image failed"),
  });

  const deleteVolume = useMutation({
    mutationFn: platformApi.deleteDockerVolume,
    onSuccess: () => {
      toast.success("Volume removed");
      volumes.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Volume delete failed"),
  });

  const createVolume = useMutation({
    mutationFn: ({ name, driver }: { name: string; driver?: string }) => platformApi.createDockerVolume(name, driver),
    onSuccess: () => {
      toast.success("Volume created");
      volumes.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Volume create failed"),
  });

  const pruneVolumes = useMutation({
    mutationFn: platformApi.pruneDockerVolumes,
    onSuccess: () => {
      toast.success("Unused volumes pruned");
      volumes.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Prune failed"),
  });

  const pruneNetworks = useMutation({
    mutationFn: platformApi.pruneDockerNetworks,
    onSuccess: () => {
      toast.success("Unused networks pruned");
      networks.refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Network prune failed"),
  });

  const location = useLocation();
  const searchQuery = new URLSearchParams(location.search).get("q")?.trim().toLowerCase() ?? "";
  const filteredContainers = (containers.data?.containers ?? []).filter((c) => {
    if (!searchQuery) return true;
    const name = String(c.names ?? "").toLowerCase();
    const image = String(c.image ?? "").toLowerCase();
    const statusText = String(c.status ?? "").toLowerCase();
    return name.includes(searchQuery) || image.includes(searchQuery) || statusText.includes(searchQuery);
  });
  const filteredImages = (images.data?.images ?? []).filter((img) => {
    if (!searchQuery) return true;
    const repo = String(img.repository ?? "").toLowerCase();
    const tag = String(img.tag ?? "").toLowerCase();
    return repo.includes(searchQuery) || tag.includes(searchQuery);
  });
  const filteredVolumes = (volumes.data?.volumes ?? []).filter((v) => {
    if (!searchQuery) return true;
    const blob = `${v.name} ${v.driver} ${v.mountpoint ?? ""} ${v.attached_containers ?? ""}`.toLowerCase();
    return blob.includes(searchQuery);
  });
  const filteredNetworks = (networks.data?.networks ?? []).filter((n) => {
    if (!searchQuery) return true;
    const blob = `${n.name} ${n.driver} ${n.id}`.toLowerCase();
    return blob.includes(searchQuery);
  });

  const openDockerInstallDocs = async () => {
    const data = await platformApi.dockerInstall(false);
    const os = String(data?.os ?? "").toLowerCase();
    const url =
      os === "windows"
        ? "https://docs.docker.com/desktop/install/windows-install/"
        : os === "darwin"
          ? "https://docs.docker.com/desktop/install/mac-install/"
          : "https://docs.docker.com/engine/install/";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <PageShell>
      <PageHeader title="Docker" subtitle="Engine, containers, images, named volumes, and bridge networks" />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "containers" as const, label: "Containers", icon: Square },
            { id: "images" as const, label: "Images", icon: ImagePlus },
            { id: "volumes" as const, label: "Volumes", icon: Layers },
            { id: "networks" as const, label: "Networks", icon: Network },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            size="sm"
            variant={dockerTab === id ? "default" : "outline"}
            className="gap-2 font-mono text-xs"
            onClick={() => setDockerTab(id)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={status.data?.installed ? "success" : "danger"}>
            {status.data?.installed ? "Docker installed" : "Docker not installed"}
          </Badge>
          <Badge variant={status.data?.daemon_running ? "success" : "warning"}>
            {status.data?.daemon_running ? "Daemon running" : "Daemon stopped"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => daemon.mutate("start")}>
            Start
          </Button>
          <Button size="sm" variant="outline" onClick={() => daemon.mutate("restart")}>
            Restart
          </Button>
          <Button size="sm" variant="destructive" onClick={() => daemon.mutate("stop")}>
            Stop
          </Button>
          <Button size="sm" variant="outline" onClick={openDockerInstallDocs}>
            Install guide
          </Button>
          <Button size="sm" variant="outline" onClick={() => dockerInstall.mutate(true)}>
            <Download className="mr-2 size-4" />
            Install Docker
          </Button>
        </CardContent>
        <CardContent className="pt-0">
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-600">
            <strong className="font-extrabold">NOTE:</strong> Docker and container features work best on hosts with sufficient memory. Make sure your VPS has at least <strong>2GB RAM</strong> available before using Docker features.          </div>
        </CardContent>
        {installNote || installError ? (
          <CardContent className="pt-0">
            {installNote ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                {installNote}
              </div>
            ) : null}
            {installError ? (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
                {installError}
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      {dockerTab === "containers" ? (
      <Card>
        <CardHeader>
          <CardTitle>Containers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ports</TableHead>
                <TableHead className="max-w-35">Mounts</TableHead>
                <TableHead className="max-w-30">Networks</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContainers.map((c) => {
                const name = c.names || c.id;
                const state = String(c.state ?? "").toLowerCase();
                const statusText = String(c.status ?? "-");
                const isRunning = state === "running" || statusText.toLowerCase().includes("up");
                const hostPort = parseDockerHostPort(String(c.ports ?? ""));
                const url = hostPort ? `http://localhost:${hostPort}` : "";
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.names || "-"}</TableCell>
                    <TableCell>{c.image || "-"}</TableCell>
                    <TableCell>{statusText}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.ports || "-"}</TableCell>
                    <TableCell className="max-w-35 truncate text-xs text-muted-foreground" title={c.mounts || ""}>
                      {c.mounts || "—"}
                    </TableCell>
                    <TableCell className="max-w-30 truncate text-xs text-muted-foreground" title={c.networks || ""}>
                      {c.networks || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {url ? (
                        <a className="text-primary hover:underline" href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label="Launch container"
                          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                          disabled={!isRunning || !hostPort}
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label="Create image from container"
                          onClick={() => {
                            const suggested = `${String(c.names || c.id).replaceAll(" ", "-")}:latest`;
                            const input = window.prompt("Image name (repo:tag)", suggested);
                            if (!input) return;
                            const [repository, tag] = input.split(":");
                            if (!repository) {
                              toast.error("Image name is required");
                              return;
                            }
                            commitContainer.mutate({ name, repository, tag });
                          }}
                        >
                          <ImagePlus className="size-4" />
                        </Button>
                        {isRunning ? (
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Stop container"
                            onClick={() => stopContainer.mutate(name)}
                          >
                            <Square className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Start container"
                            onClick={() => startContainer.mutate(name)}
                          >
                            <Play className="size-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="destructive"
                          aria-label="Delete container"
                          onClick={() => deleteContainer.mutate(name)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filteredContainers.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No containers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      ) : dockerTab === "images" ? (
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredImages.map((img) => (
                <TableRow key={img.id}>
                  <TableCell>{img.repository || "-"}</TableCell>
                  <TableCell>{img.tag || "-"}</TableCell>
                  <TableCell>{img.size || "-"}</TableCell>
                  <TableCell>{img.created || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Create container from image"
                        onClick={() => {
                          const imageRef = img.id || `${img.repository}:${img.tag || "latest"}`;
                          const name = window.prompt("Container name (optional)", "");
                          const portRaw = window.prompt("Port to expose (optional)", "");
                          const port = portRaw ? Number(portRaw) : undefined;
                          if (portRaw && Number.isNaN(port)) {
                            toast.error("Port must be a number");
                            return;
                          }
                          runImage.mutate({ image: imageRef, name: name?.trim() || undefined, port });
                        }}
                      >
                        <Play className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label="Delete image"
                        onClick={() => deleteImage.mutate(img.id || `${img.repository}:${img.tag}`)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredImages.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No images found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      ) : dockerTab === "volumes" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-mono text-base">Named volumes</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const n = window.prompt("New volume name", "skyport-data");
                  if (!n?.trim()) return;
                  createVolume.mutate({ name: n.trim() });
                }}
              >
                Create volume
              </Button>
              <Button size="sm" variant="outline" onClick={() => pruneVolumes.mutate()} disabled={pruneVolumes.isPending}>
                Prune unused
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Attached</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVolumes.map((v) => (
                  <TableRow key={v.name}>
                    <TableCell className="font-mono text-xs">{v.name}</TableCell>
                    <TableCell>{v.driver || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {v.size_bytes ? formatVolBytes(v.size_bytes) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.attached_containers || (v.in_use ? "in use" : "unused")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.created_at || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label="Delete volume"
                        disabled={Boolean(v.in_use)}
                        onClick={() => {
                          if (!window.confirm(`Delete volume ${v.name}?`)) return;
                          deleteVolume.mutate(v.name);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredVolumes.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {status.data?.daemon_running ? "No volumes match this filter." : "Start the Docker daemon to inspect volumes."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : dockerTab === "networks" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-mono text-base">Networks</CardTitle>
            <Button size="sm" variant="outline" onClick={() => pruneNetworks.mutate()} disabled={pruneNetworks.isPending}>
              Prune unused
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="font-mono text-xs">ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNetworks.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">{n.name}</TableCell>
                    <TableCell>{n.driver}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{n.scope || "—"}</TableCell>
                    <TableCell className="max-w-45 truncate font-mono text-[10px] text-muted-foreground">{n.id}</TableCell>
                  </TableRow>
                ))}
                {!filteredNetworks.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {status.data?.daemon_running ? "No networks match this filter." : "Start the Docker daemon to list networks."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}

function parseDockerHostPort(ports: string) {
  if (!ports) return 0;
  const match = ports.match(/(?:\b|:)(\d+)->\d+\/(tcp|udp)/i);
  if (!match) return 0;
  const port = Number(match[1]);
  return Number.isFinite(port) ? port : 0;
}

function formatVolBytes(n: number) {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}
