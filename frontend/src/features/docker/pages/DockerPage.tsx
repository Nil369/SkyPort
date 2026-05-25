import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, ImagePlus, Layers, Network, Play, Square, Trash2, ChevronDown } from "lucide-react";
import { useLocation } from "react-router";
import toast from "react-hot-toast";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";
import { CodeEditor } from "@/components/editor/CodeEditor";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { parseEnvTextStrict } from "@/lib/envUtils";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

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

  const composeDeploy = useMutation({
    mutationFn: ({ compose, projectPath }: { compose: string; projectPath?: string }) =>
      platformApi.composeDeploy(compose, projectPath),
    onMutate: () => {
      // optionally reset logs / UI
    },
    onSuccess: (data) => {
      toast.success('Compose deployed');
      console.info('compose deploy', data);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? 'Compose deploy failed');
    },
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
  const [dockerHubImage, setDockerHubImage] = React.useState("");
  const [dockerHubTag, setDockerHubTag] = React.useState("");
  const [dockerHubPort, setDockerHubPort] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [showEditor, setShowEditor] = React.useState(false);
  const [dockerfileContent, setDockerfileContent] = React.useState("");
  const [editorMode, setEditorMode] = React.useState<"dockerfile" | "compose">("dockerfile");
  const [pulling, setPulling] = React.useState(false);
  const [pullLogs, setPullLogs] = React.useState<string[]>([]);
  const [envs, setEnvs] = React.useState<Array<{ key: string; value: string }>>([]);
  const [envText, setEnvText] = React.useState<string>("");
  const [repoDescription, setRepoDescription] = React.useState<string>("");
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: platformApi.listProjects });
  const [selectedProjectPath, setSelectedProjectPath] = React.useState<string | null>(null);
  const autoGeneratedRef = React.useRef<{ composeGenerated: boolean }>({ composeGenerated: false });

  React.useEffect(() => {
    if (editorMode !== 'compose') return;
    if (autoGeneratedRef.current.composeGenerated) return;
    if (dockerfileContent && dockerfileContent.trim() !== '') return;

    (async () => {
      // Try project-based detection first
      if (selectedProjectPath) {
        try {
          const det = await platformApi.detectProjectRuntime(selectedProjectPath);
          const rt = String(det.runtime ?? '').toLowerCase();
          if (rt.includes('node') || rt.includes('express') || rt.includes('next')) {
            setDockerfileContent(SAMPLES.composeNodeMongo);
            autoGeneratedRef.current.composeGenerated = true;
            setShowEditor(true);
            return;
          }
          if (rt.includes('python')) {
            setDockerfileContent(SAMPLES.composeNodeMongo);
            autoGeneratedRef.current.composeGenerated = true;
            setShowEditor(true);
            return;
          }
        } catch {
          // ignore
        }
      }

      // Try dockerHubImage hints
      const img = dockerHubImage.trim().toLowerCase();
      if (img.includes('mongo') || img.includes('mongodb')) {
        setDockerfileContent(SAMPLES.composeNodeMongo);
        autoGeneratedRef.current.composeGenerated = true;
        setShowEditor(true);
        return;
      }
      if (img.includes('postgres') || img.includes('postgresql') || img.includes('postgres:')) {
        setDockerfileContent(SAMPLES.composeNodeMongo);
        autoGeneratedRef.current.composeGenerated = true;
        setShowEditor(true);
        return;
      }

      // Fallback
      setDockerfileContent(SAMPLES.composeNodeMongo);
      autoGeneratedRef.current.composeGenerated = true;
      setShowEditor(true);
    })();
  }, [editorMode, selectedProjectPath, dockerHubImage]);
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

  const parseEnvFromDescription = (desc: string) => {
    const parsed = parseEnvTextStrict(desc);
    if (!parsed) return [] as Array<{ key: string; value: string }>;
    return Object.keys(parsed).map((key) => ({ key, value: parsed[key] }));
  }

  const SAMPLES = {
    nodeDockerfile: `# Simple Node.js Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "./dist/index.js"]
`,
    composeNodeMongo: `version: "3.8"
services:
  app:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./:/app
    command: sh -c "npm ci && npm run start"
    environment:
      - NODE_ENV=production
    ports:
      - "3000:3000"
    depends_on:
      - mongo

  mongo:
    image: mongo:6
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=secret

  mongo-express:
    image: mongo-express:1.0.0
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      - ME_CONFIG_MONGODB_ADMINUSERNAME=admin
      - ME_CONFIG_MONGODB_ADMINPASSWORD=secret
      - ME_CONFIG_MONGODB_SERVER=mongo

volumes:
  mongo-data:
`,
  };

  function generateComposeFromInputs(): string {
    const imageWithTag = dockerHubTag ? `${dockerHubImage.trim()}:${dockerHubTag.trim()}` : dockerHubImage.trim();
    const svcImage = imageWithTag || 'node:20-alpine';
    const envLines = envs.filter(e=>e.key).map(e => `      - ${e.key}=${e.value}`).join('\n');
    const portLine = dockerHubPort ? `      - "${dockerHubPort.trim()}:3000"\n` : '';

    // Determine additional services
    const needsMongo = svcImage.includes('mongo') || dockerHubImage.toLowerCase().includes('mongo');

    let compose = `version: "3.8"\nservices:\n  app:\n    image: ${svcImage}\n    working_dir: /app\n    volumes:\n      - ./:/app\n    command: sh -c \"npm ci && npm run start\"\n`;

    if (envLines) compose += `    environment:\n${envLines}\n`;
    if (portLine) compose += `    ports:\n${portLine}`;
    if (needsMongo) compose += `    depends_on:\n      - mongo\n`;

    if (needsMongo) {
      compose += `\n  mongo:\n    image: mongo:6\n    restart: unless-stopped\n    volumes:\n      - mongo-data:/data/db\n    environment:\n      - MONGO_INITDB_ROOT_USERNAME=admin\n      - MONGO_INITDB_ROOT_PASSWORD=secret\n`;

      compose += `\n  mongo-express:\n    image: mongo-express:1.0.0\n    restart: unless-stopped\n    ports:\n      - \"8081:8081\"\n    environment:\n      - ME_CONFIG_MONGODB_ADMINUSERNAME=admin\n      - ME_CONFIG_MONGODB_ADMINPASSWORD=secret\n      - ME_CONFIG_MONGODB_SERVER=mongo\n`;
    }

    compose += `\nvolumes:\n  mongo-data:\n`;
    return compose;
  }

  React.useEffect(() => {
    // when key inputs change allow regen
    autoGeneratedRef.current.composeGenerated = false;
  }, [dockerHubImage, dockerHubTag, dockerHubPort, JSON.stringify(envs), selectedProjectPath]);
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Deploy from Docker Hub</CardTitle>
          <CardDescription>
            Enter a Docker Hub image like <span className="font-mono">node</span> or <span className="font-mono">nginx</span>,
            optionally choose a tag, then generate or edit a Dockerfile before deploying.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
            <Input
              placeholder="image name (namespace/repo or repo) e.g. node or library/node"
              value={dockerHubImage}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDockerHubImage(e.target.value)}
              className="w-full"
            />

            <Input
              placeholder="tag (optional) e.g. 20, latest"
              value={dockerHubTag}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDockerHubTag(e.target.value)}
              className="w-full"
            />

            <Input
              placeholder="host port"
              value={dockerHubPort}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDockerHubPort(e.target.value)}
              className="w-full"
            />

            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!dockerHubImage.trim()) return;
                const normalizedImage = dockerHubImage.trim();
                try {
                  const data = await platformApi.dockerHubTags(normalizedImage);
                  const list = data.tags ?? [];
                  setTags(list);
                  if (list.length && !dockerHubTag) setDockerHubTag(list[0]);
                  toast.success("Tags fetched");
                } catch (err: any) {
                  setTags([]);
                  toast.error(err?.response?.data?.error?.message ?? "Failed to fetch tags from Docker Hub");
                }
              }}
            >
              Fetch tags
            </Button>
          </div>

          {/* Env inputs and editor preview moved above action buttons */}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Environment (optional)</span>
                <Button size="xs" variant="outline" onClick={async () => {
                  if (!dockerHubImage.trim()) { toast.error("Provide image first"); return; }
                  try {
                    const res: any = await platformApi.dockerHubRepo(dockerHubImage.trim());
                    const repo: any = res.repo ?? {};
                    const desc: string = String(repo.full_description ?? repo.description ?? "");
                    setRepoDescription(desc || "");
                    const parsed = parseEnvFromDescription(desc || "");
                    if (parsed.length === 0) {
                      toast("No obvious env vars found in repo description");
                    } else {
                      setEnvs(parsed);
                      toast.success("Prefilled env inputs from Docker Hub description");
                    }
                  } catch (err: any) {
                    toast.error("Failed to fetch repo metadata");
                  }
                }}>Prefill from Hub</Button>
              </div>

              <div className="flex items-center gap-2">
                <Button size="xs" variant="ghost" onClick={() => {
                  const parsedObj = parseEnvTextStrict(envText);
                  if (!parsedObj) { toast.error("No envs parsed"); return; }
                  const parsed = Object.keys(parsedObj).map((key) => ({ key, value: parsedObj[key] }));
                  setEnvs(parsed);
                  toast.success("Parsed envs from textarea");
                }}>Parse envs</Button>
                <Button size="xs" variant="outline" onClick={() => { setEnvText(""); setEnvs([]); }}>Clear</Button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-1">
              <Textarea placeholder={"Paste envs here (KEY=value, JSON, Dockerfile ENV lines)"} value={envText} onChange={(e)=>setEnvText(e.target.value)} />

              {repoDescription ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">Repository description</div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        const parsed = parseEnvFromDescription(repoDescription || "");
                        if (!parsed.length) {
                          toast.error("No envs found in description");
                          return;
                        }
                        setEnvs(parsed);
                        toast.success("Parsed envs from description");
                      }}
                    >
                      Parse from description
                    </Button>
                  </div>

                  <div className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-background p-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                      components={{
                        h1: ({ children }) => <h1 className="mb-3 text-lg font-semibold tracking-tight">{children}</h1>,
                        h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold">{children}</h2>,
                        h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold">{children}</h3>,
                        p: ({ children }) => <p className="mb-3 leading-6 text-foreground/90">{children}</p>,
                        ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="leading-6 text-foreground/90">{children}</li>,
                        a: ({ href, children }) => (
                          <a className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary" href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                        code: ({ className, children, ...props }) => {
                          const inline = !className;
                          return inline ? (
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                        pre: ({ children }) => (
                          <pre className="mb-3 overflow-x-auto rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground">
                            {children}
                          </pre>
                        ),
                      }}
                    >
                      {repoDescription}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}

            </div>

            <div className="grid gap-2 md:grid-cols-3">
              {envs.map((e, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input placeholder="KEY" value={e.key} onChange={(ev) => setEnvs(es => { const copy = [...es]; copy[idx].key = ev.target.value; return copy; })} />
                  <Input placeholder="value (optional)" value={e.value} onChange={(ev) => setEnvs(es => { const copy = [...es]; copy[idx].value = ev.target.value; return copy; })} />
                  <Button size="sm" variant="destructive" onClick={() => setEnvs(es => es.filter((_,i)=>i!==idx))}>Remove</Button>
                </div>
              ))}
              <div>
                <Button size="sm" onClick={() => setEnvs(es => [...es, { key: "", value: "" }])}>Add env</Button>
              </div>
            </div>
          </div>


          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="w-36 justify-between">
                    <span className="truncate cursor-pointer">{editorMode === 'compose' ? 'docker-compose.yml' : 'Dockerfile'}</span>
                    <ChevronDown className="ml-2 size-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-50 ">
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setEditorMode('dockerfile')}>Dockerfile</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setEditorMode('compose')}>docker-compose.yml</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                onClick={() => {
                  if (editorMode === "dockerfile") {
                    const imageWithTag = dockerHubTag ? `${dockerHubImage}:${dockerHubTag}` : dockerHubImage || "";
                    const envLines = envs
                      .map((e) => (e.key ? formatDockerfileEnvLine(e.key, e.value) : ""))
                      .filter(Boolean)
                      .join("\n");
                    const df = `FROM ${imageWithTag}\n\n# Working dir\nWORKDIR /app\n\n${envLines ? envLines + '\n\n' : ''}# Expose port\n${dockerHubPort ? `EXPOSE ${dockerHubPort}\n\n` : ""}# Default command - override in editor\nCMD [\"sh\", \"-c\", \"sleep infinity\"]\n`;
                    setDockerfileContent(df);
                    setShowEditor(true);
                  } else {
                    const comp = generateComposeFromInputs();
                    setDockerfileContent(comp);
                    setShowEditor(true);
                  }
                }}
              >
                Generate
              </Button>

              <Button size="sm" variant="ghost" onClick={() => { setDockerfileContent(SAMPLES.nodeDockerfile); setEditorMode('dockerfile'); setShowEditor(true); }}>Insert Node Dockerfile sample</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDockerfileContent(SAMPLES.composeNodeMongo); setEditorMode('compose'); setShowEditor(true); }}>Insert Compose sample</Button>
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={async () => {
                if (!status.data?.installed) {
                  toast.error("Docker is not installed on this host.");
                  return;
                }

                if (!status.data?.daemon_running) {
                  toast.error("Docker daemon is not running.");
                  return;
                }

                const imageWithTag = dockerHubTag ? `${dockerHubImage}:${dockerHubTag}` : dockerHubImage;
                if (!imageWithTag) {
                  toast.error("Please provide an image to deploy.");
                  return;
                }

                const name = dockerHubImage.replace(/[^a-zA-Z0-9-_]/g, "-");
                const portNum = parseInt(dockerHubPort) || undefined;

                // Start streaming pull output via EventSource, disable button while pulling
                setPullLogs([]);
                setPulling(true);
                const es = new EventSource(`/api/v1/docker/image/${encodeURIComponent(imageWithTag)}/pull/stream`);
                es.onmessage = (ev) => {
                  setPullLogs((p) => [...p, ev.data]);
                };
                es.addEventListener("error", (ev: any) => {
                  setPullLogs((p) => [...p, `ERROR: ${ev?.data ?? "stream error"}`]);
                  setPulling(false);
                  es.close();
                });
                es.addEventListener("done", () => {
                  setPullLogs((p) => [...p, "PULL_COMPLETE"]);
                  setPulling(false);
                  es.close();
                  // After pulling, run the container
                  runImage.mutate({ image: imageWithTag, name, port: portNum });
                });
              }}
            >
              {pulling ? "Pulling..." : "Pull & Deploy"}
            </Button>
          </div>

          {tags.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Popular tags:</span>
              {tags.slice(0, 8).map((t) => (
                <button
                  key={t}
                  className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-muted"
                  onClick={() => setDockerHubTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          {showEditor ? (
            <div className="space-y-3">
              <div className="w-full overflow-hidden rounded-lg border border-border/60 bg-background">
                <CodeEditor
                  value={dockerfileContent}
                  onChange={(v) => setDockerfileContent(v)}
                  language={editorMode === 'compose' ? 'yaml' : 'dockerfile'}
                  className="w-full"
                  height="420px"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {editorMode === 'dockerfile' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!status.data?.installed || !status.data?.daemon_running) {
                        toast.error("Docker is not running or installed.");
                        return;
                      }

                      const finalImage = dockerHubTag ? `${dockerHubImage}:${dockerHubTag}` : dockerHubImage;
                      const name = dockerHubImage.replace(/[^a-zA-Z0-9-_]/g, "-");
                    <div className="col-span-4">
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">Project (optional):</label>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">{selectedProjectPath ? (projectsQ.data?.find(p=>p.path===selectedProjectPath)?.name ?? selectedProjectPath) : "-- (none) --"}<ChevronDown className="ml-2 size-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => setSelectedProjectPath(null)}>None</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {projectsQ.data?.map((p) => (
                              <DropdownMenuItem key={p.path} onClick={() => setSelectedProjectPath(p.path)}>{p.name} — {p.path}</DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button size="xs" variant="outline" onClick={async () => {
                          if (!selectedProjectPath) { toast.error('Select a project to auto-detect'); return; }
                          try {
                            const det = await platformApi.detectProjectRuntime(selectedProjectPath);
                            if (!det) { toast.error('Runtime detection failed'); return; }
                            toast.success(`Detected runtime: ${det.runtime}`);
                            // pick compose template based on runtime
                              const rt = String(det.runtime).toLowerCase();
                              if (rt.includes('node') || rt.includes('express') || rt.includes('next')) {
                              setDockerfileContent(SAMPLES.composeNodeMongo);
                            } else if (rt.includes('python')) {
                              setDockerfileContent(SAMPLES.composeNodeMongo);
                            } else if (rt.includes('postgres') || rt.includes('sql') ) {
                              setDockerfileContent(SAMPLES.composeNodeMongo);
                            } else {
                              setDockerfileContent(SAMPLES.composeNodeMongo);
                            }
                            setEditorMode('compose');
                            setShowEditor(true);
                          } catch (err: any) {
                            toast.error('Runtime detection failed');
                          }
                        }}>Detect from project</Button>
                      </div>
                    </div>
                      const portNum = parseInt(dockerHubPort) || undefined;
                      // same streaming flow for the editor deploy path
                      setPullLogs([]);
                      setPulling(true);
                      const es = new EventSource(`/api/v1/docker/image/${encodeURIComponent(finalImage)}/pull/stream`);
                      es.onmessage = (ev) => setPullLogs((p) => [...p, ev.data]);
                      es.addEventListener("error", (ev: any) => { setPullLogs((p) => [...p, `ERROR: ${ev?.data ?? "stream error"}`]); setPulling(false); es.close(); });
                      es.addEventListener("done", () => { setPullLogs((p) => [...p, "PULL_COMPLETE"]); setPulling(false); es.close(); runImage.mutate({ image: finalImage, name, port: portNum }); });
                    }}
                  >
                    Deploy edited Dockerfile (pull & run)
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { navigator.clipboard?.writeText(dockerfileContent); toast.success('Compose copied to clipboard'); }}>Copy compose to clipboard</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const blob = new Blob([dockerfileContent], { type: 'text/yaml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'docker-compose.yml';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}>Download compose file</Button>
                    <Button size="sm" variant="default" disabled={composeDeploy.isPending || !status.data?.daemon_running} onClick={() => {
                      if (!status.data?.installed || !status.data?.daemon_running) { toast.error('Docker is not running or installed.'); return; }
                      composeDeploy.mutate({ compose: dockerfileContent, projectPath: selectedProjectPath ?? undefined });
                    }}>
                      {composeDeploy.isPending ? 'Deploying...' : 'Deploy compose'}
                    </Button>
                  </div>
                )}

                <Button size="sm" variant="outline" onClick={() => setShowEditor(false)}>
                  Close Editor
                </Button>
              </div>
            </div>
          ) : null}

          {/* Pull progress output */}
          {pullLogs.length ? (
            <div className="mt-2 rounded-md border bg-slate-50 p-3 text-xs">
              <div className="font-mono text-xs">Pull output:</div>
              <pre className="max-h-48 overflow-auto text-[11px]">{pullLogs.join('\n')}</pre>
            </div>
          ) : null}
        </CardContent>
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

function formatDockerfileEnvLine(key: string, value: string) {
  const normalizedKey = key.trim();
  if (!normalizedKey) return "";
  const normalizedValue = value.trim();
  if (!normalizedValue) return `ENV ${normalizedKey}=`;
  const needsQuotes = /\s|['"\\]/.test(normalizedValue);
  const renderedValue = needsQuotes ? JSON.stringify(normalizedValue) : normalizedValue;
  return `ENV ${normalizedKey}=${renderedValue}`;
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
