import { http } from "@/services/api/http";

export type Project = {
  id: number;
  name: string;
  path: string;
  gitURL?: string;
  createdAt?: string;
};

export type Deployment = {
  id: number;
  projectID: number;
  path: string;
  runtime: string;
  strategy: string;
  status: string;
  error?: string;
  createdAt?: string;
};

export type FsItem = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

export const platformApi = {
  listProjects: async () => (await http.get<Project[]>("/projects")).data,
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

  listDeployments: async () => (await http.get<Deployment[]>("/deployments")).data,
  createDeployment: async (input: {
    project_id: number;
    auto_start?: boolean;
    port?: number;
    working_directory?: string;
    start_cmd?: string;
  }) => (await http.post<Deployment>("/deployments", input)).data,
  rolloutDeployment: async (id: number, mode: "reload" | "restart" = "restart") =>
    (await http.post(`/deployments/${id}/rollout`, { mode })).data,

  listFiles: async (path: string) =>
    (await http.get<{ path: string; items: FsItem[] }>("/files", { params: { path } })).data,
  readFile: async (path: string) =>
    (await http.post<{ path: string; content?: string; preview?: string; encoding?: string; content_type?: string; size?: number }>("/files/read", { path })).data,
  writeFile: async (path: string, content: string) => (await http.put("/files/write", { path, content })).data,
  createFile: async (path: string, filename: string) => (await http.post("/files/file", { path, filename, content: "" })).data,
  createFolder: async (path: string) => (await http.post("/files/folder", { path })).data,
  downloadFileBlob: async (path: string) =>
    (
      await http.get<Blob>("/files/download", {
        params: { path },
        responseType: "blob",
      })
    ).data,

  dockerStatus: async () =>
    (await http.get<{ installed: boolean; daemon_running: boolean; version?: string }>("/docker/status")).data,
  listContainers: async () => (await http.get<{ containers: Array<Record<string, unknown>> }>("/docker/containers")).data,
  dockerDaemon: async (action: "start" | "stop" | "restart") => (await http.post("/docker/daemon", { action })).data,

  systemInfo: async () => (await http.get<Record<string, unknown>>("/system/info")).data,
  metricsSnapshot: async () => (await http.get<Record<string, unknown>>("/metrics")).data,

  generateDomainProxy: async (input: { domain: string; port: number; type: "caddy" | "nginx"; enable_ssl: boolean; email?: string }) =>
    (await http.post("/proxy/generate", { ...input, execute: false, reload: false })).data,
};
