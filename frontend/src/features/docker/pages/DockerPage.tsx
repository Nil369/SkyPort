import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, ImagePlus, Play, Square, Trash2 } from "lucide-react";
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
  const daemon = useMutation({ mutationFn: platformApi.dockerDaemon, onSuccess: () => status.refetch() });
  const dockerInstall = useMutation({
    mutationFn: platformApi.dockerInstall,
    onSuccess: (data: any) => {
      if (data?.install) {
        toast.success("Install command ready");
      } else if (data?.executed) {
        toast.success("Docker install started");
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Docker install failed"),
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
      <PageHeader title="Docker" subtitle="Containers, images, volumes, and warnings" />

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
      </Card>

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
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.names || "-"}</TableCell>
                    <TableCell>{c.image || "-"}</TableCell>
                    <TableCell>{statusText}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label="Launch container"
                          onClick={() => window.open(`http://localhost:${hostPort}`, "_blank", "noopener,noreferrer")}
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
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No containers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
