import { http } from "@/services/api/http";

export type Project = {
  id: number;
  name: string;
  path: string;
  gitURL?: string;
  git_url?: string;
  private?: boolean;
  createdAt?: string;
};

export type Deployment = {
  id: number;
  projectID?: number;
  project_id?: number;
  path: string;
  runtime: string;
  strategy: string;
  status: string;
  error?: string;
  port?: number;
  createdAt?: string;
};

export type DockerContainer = {
  id: string;
  names: string;
  image: string;
  status: string;
  ports: string;
  state: string;
  created: string;
};

export type DockerImage = {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
};

export type FsItem = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

export type GitStatus = {
  installed: boolean;
  path?: string;
  version?: string;
};

export type GitCredentials = {
  git_auth_type?: "ssh" | "pat";
  has_pat?: boolean;
  has_ssh_key?: boolean;
};

export type RuntimeInstallResult = {
  runtime: string;
  commands?: string[];
};

export type RuntimeInstallResponse = {
  present?: boolean;
  found_in?: string;
  skipped_install?: boolean;
  message?: string;
  result?: RuntimeInstallResult;
};

export type Pm2Process = {
  name?: string;
  pid?: number;
  pm_id?: number;
  status?: string;
  pm2_env?: Record<string, any>;
  monit?: Record<string, any>;
};

export type DomainMapping = {
  id: number;
  domain: string;
  port: number;
  type: "caddy" | "nginx";
  enable_ssl: boolean;
  email?: string;
  project_id?: number | null;
  created_at?: string;
};

const normalizeProject = (raw: any): Project => ({
  id: raw?.id ?? raw?.ID ?? raw?.Id ?? 0,
  name: raw?.name ?? raw?.Name ?? "",
  path: raw?.path ?? raw?.Path ?? "",
  gitURL: raw?.gitURL ?? raw?.GitURL ?? raw?.git_url ?? raw?.GitUrl,
  git_url: raw?.git_url ?? raw?.gitURL ?? raw?.GitURL,
  private: raw?.private ?? raw?.Private ?? false,
  createdAt: raw?.createdAt ?? raw?.CreatedAt,
});

const normalizeDeployment = (raw: any): Deployment => ({
  id: raw?.id ?? raw?.ID ?? raw?.Id ?? 0,
  projectID: raw?.projectID ?? raw?.ProjectID ?? raw?.project_id,
  project_id: raw?.project_id ?? raw?.ProjectID ?? raw?.projectID,
  path: raw?.path ?? raw?.Path ?? "",
  runtime: raw?.runtime ?? raw?.Runtime ?? "",
  strategy: raw?.strategy ?? raw?.Strategy ?? "",
  status: raw?.status ?? raw?.Status ?? "",
  error: raw?.error ?? raw?.Error,
  port: raw?.port ?? raw?.Port ?? undefined,
  createdAt: raw?.createdAt ?? raw?.CreatedAt,
});

export const platformApi = {
  listProjects: async () => (await http.get<any[]>("/projects")).data.map(normalizeProject),
  createProject: async (input: {
    name: string;
    git_url?: string;
    git_branch?: string;
    private?: boolean;
    git_auth_type?: "ssh" | "pat";
    git_ssh_key?: string;
    git_pat?: string;
  }) =>
    (await http.post<Project>("/projects", input)).data,
  deleteProject: async (id: number) => (await http.delete(`/projects/${id}`)).data,

  listDeployments: async () => (await http.get<any[]>("/deployments")).data.map(normalizeDeployment),
  createDeployment: async (input: {
    project_id: number;
    auto_start?: boolean;
    strategy?: "docker" | "pm2" | "native";
    port?: number;
    env?: Record<string, string>;
    working_directory?: string;
    start_cmd?: string;
  }) => (await http.post<Deployment>("/deployments", input)).data,
  deleteDeployment: async (id: number) => (await http.delete(`/deployments/${id}`)).data,
  rolloutDeployment: async (id: number, mode: "reload" | "restart" = "restart") =>
    (await http.post(`/deployments/${id}/rollout`, { mode })).data,

  listFiles: async (path: string) =>
    (await http.get<{ path: string; items: FsItem[] }>("/files", { params: { path } })).data,
  readFile: async (path: string) =>
    (await http.post<{ path: string; content?: string; preview?: string; encoding?: string; content_type?: string; size?: number }>("/files/read", { path })).data,
  writeFile: async (path: string, content: string) => (await http.put("/files/write", { path, content })).data,
  createFile: async (path: string, filename: string) => (await http.post("/files/file", { path, filename, content: "" })).data,
  createFolder: async (path: string) => (await http.post("/files/folder", { path })).data,
  uploadFile: async (path: string, file: File) => {
    const form = new FormData();
    form.append("path", path);
    form.append("file", file);
    return (await http.post("/files/upload", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  downloadFileBlob: async (path: string) =>
    (
      await http.get<Blob>("/files/download", {
        params: { path },
        responseType: "blob",
      })
    ).data,

  dockerStatus: async () =>
    (await http.get<{ installed: boolean; daemon_running: boolean; version?: string }>("/docker/status")).data,
  listContainers: async () =>
    (await http.get<{ containers: DockerContainer[] }>("/docker/containers")).data,
  listImages: async () => (await http.get<{ images: DockerImage[] }>("/docker/images")).data,
  dockerInstall: async (execute: boolean) =>
    (await http.post("/docker/install", { execute })).data,
  startContainer: async (name: string) => (await http.post(`/docker/container/${encodeURIComponent(name)}/start`)).data,
  stopContainer: async (name: string) => (await http.post(`/docker/container/${encodeURIComponent(name)}/stop`)).data,
  restartContainer: async (name: string) => (await http.post(`/docker/container/${encodeURIComponent(name)}/restart`)).data,
  deleteContainer: async (name: string) => (await http.delete(`/docker/container/${encodeURIComponent(name)}`)).data,
  commitContainer: async (name: string, repository: string, tag?: string) =>
    (await http.post(`/docker/container/${encodeURIComponent(name)}/commit`, { repository, tag })).data,
  runImage: async (image: string, name?: string, port?: number) =>
    (await http.post(`/docker/image/${encodeURIComponent(image)}/run`, { name, port })).data,
  deleteImage: async (name: string) => (await http.delete(`/docker/image/${encodeURIComponent(name)}`)).data,
  dockerDaemon: async (action: "start" | "stop" | "restart") => (await http.post("/docker/daemon", { action })).data,

  systemInfo: async () => (await http.get<Record<string, unknown>>("/system/info")).data,
  gitStatus: async () => (await http.get<GitStatus>("/system/git/status")).data,
  gitInstall: async (execute: boolean) => (await http.post("/system/git/install", { execute })).data,
  getGitCredentials: async () => (await http.get<GitCredentials>("/auth/credentials")).data,
  updateGitCredentials: async (input: {
    git_auth_type?: "ssh" | "pat";
    git_pat?: string;
    git_ssh_key?: string;
    clear_pat?: boolean;
    clear_ssh_key?: boolean;
  }) => (await http.post<GitCredentials>("/auth/credentials", input)).data,
  metricsSnapshot: async () => (await http.get<Record<string, unknown>>("/metrics")).data,

  runtimeInstall: async (runtime: string, execute: boolean) =>
    (await http.post<RuntimeInstallResponse>("/runtime/install", { runtime, execute, dry_run: !execute })).data,
  listPm2: async () => (await http.get<{ processes: Pm2Process[] }>("/runtime/pm2/list")).data,
  pm2Action: async (name: string, action: "start" | "stop" | "restart" | "delete") => {
    if (action === "delete") {
      return (await http.delete(`/runtime/pm2/${encodeURIComponent(name)}`)).data;
    }
    return (await http.post(`/runtime/pm2/${encodeURIComponent(name)}/${action}`)).data;
  },

  generateDomainProxy: async (input: { domain: string; port: number; type: "caddy" | "nginx"; enable_ssl: boolean; email?: string; project_id?: number }) =>
    (await http.post("/proxy/generate", { ...input, execute: false, reload: false })).data,

  listDomainMappings: async () => (await http.get<{ mappings: DomainMapping[] }>("/proxy/mappings")).data,
  createDomainMapping: async (input: { domain: string; port: number; type: "caddy" | "nginx"; enable_ssl: boolean; email?: string; project_id?: number | null }) =>
    (await http.post<DomainMapping>("/proxy/mappings", input)).data,
  updateDomainMapping: async (id: number, input: { domain: string; port: number; type: "caddy" | "nginx"; enable_ssl: boolean; email?: string; project_id?: number | null }) =>
    (await http.put<DomainMapping>(`/proxy/mappings/${id}`, input)).data,
  deleteDomainMapping: async (id: number) => (await http.delete(`/proxy/mappings/${id}`)).data,
  caddyStatus: async () => (await http.get<{ installed: boolean; path?: string; version?: string }>("/proxy/caddy/status")).data,
  caddyInstall: async (execute: boolean) => (await http.post("/proxy/caddy/install", { execute })).data,
};
