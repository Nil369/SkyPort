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
  // extended
  logPath?: string;
  containerID?: string;
  ContainerID?: string;
  commitSHA?: string;
  branch?: string;
};

export type DockerContainer = {
  id: string;
  names: string;
  image: string;
  status: string;
  ports: string;
  state: string;
  created: string;
  mounts?: string;
  networks?: string;
  local_volumes?: string;
};

export type DockerImage = {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
};

export type DockerVolume = {
  name: string;
  driver: string;
  scope?: string;
  created_at?: string;
  mountpoint?: string;
  ref_count?: number;
  size_bytes?: number;
  in_use?: boolean;
  attached_containers?: string;
};

export type DockerNetwork = {
  id: string;
  name: string;
  driver: string;
  scope?: string;
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

export type RuntimeDetectionResult = {
  runtime: string;
  confidence: string;
  matched_files: string[];
  working_directory: string;
  install_command: string;
  build_command: string;
  start_command: string;
  components: Array<{ working_directory: string; kind: string; evidence: string }>;
  notes: string;
  package_manager?: string;
  framework?: string;
  detected_port?: number;
  suggested_app_name?: string;
};

export type GitHubSetupInfo = {
  app_name: string;
  app_slug: string;
  app_install_url: string;
  api_base_url: string;
  web_base_url: string;
  has_app_config: boolean;
  has_webhook_secret: boolean;
  fallback_modes: string[];
  recommended_mode: string;
  installations: Array<{
    id: number;
    installation_id: number;
    account_login: string;
    account_type: string;
    status: string;
    last_synced_at?: string;
  }>;
};

export type GitHubBridgeInfo = {
  bridge_url: string;
  connect_url: string;
  has_app_config: boolean;
  has_private_key: boolean;
  app_id?: string;
  github_base_url?: string;
};

export type GitHubSetupConnection = {
  installation_id: number;
  connected: boolean;
};

export type GitHubSetupResponse = {
  setup: {
    bridge_url: string;
    has_app_config: boolean;
  };
  connections: GitHubSetupConnection[];
  recommendation: string;
};

export type GitHubInstallationRecord = {
  id: number;
  installation_id: number;
  created_at: string;
};

export type GitHubRepositorySummary = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  fork?: boolean;
  archived?: boolean;
  disabled?: boolean;
  default_branch: string;
  updated_at?: string;
  owner?: string;
  clone_url?: string;
  ssh_url?: string;
  homepage_url?: string;
  description?: string;
  language?: string;
  license?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  owner_avatar_url?: string;
  topics?: string[];
};

export type GitHubImportResponse = {
  project: { id: number; name: string; path: string };
  repository: GitHubRepositorySummary;
  framework: { framework: string; files: string[] };
  installation: GitHubInstallationRecord;
};

export type GitHubRepository = {
  id: number;
  repository_id: number;
  installation_id: number;
  full_name: string;
  name: string;
  owner: string;
  owner_type?: string;
  private: boolean;
  fork: boolean;
  default_branch: string;
  selected_branch?: string;
  clone_url?: string;
  ssh_url?: string;
  homepage_url?: string;
  description?: string;
  language?: string;
  runtime?: string;
  framework?: string;
  deployment_mode?: string;
  selected: boolean;
  last_synced_at?: string;
};

export type GitHubImportPreview = {
  project: { id: number; name: string; path: string };
  repository: GitHubRepository;
  runtime: Record<string, unknown>;
  deployment_suggestion: Record<string, unknown>;
  connection: Record<string, unknown>;
};

export type Pm2Process = {
  name: string;
  pm_id: number;
  pid: number;
  status: string;
  cpu: number;
  memory_bytes: number;
  uptime_sec: number;
  restarts: number;
  unstable_restarts: number;
  exec_mode: string;
  interpreter: string;
  runtime_type: string;
  script: string;
  cwd: string;
  env_port?: number;
  ports?: number[];
  namespace?: string;
  framework?: string;
  group_key?: string;
};

export type Pm2WsSnapshot = {
  type: string;
  reason?: string;
  processes: Pm2Process[];
  events?: Array<{ kind: string; name: string; prev_status?: string; next_status?: string; message?: string }>;
  signature?: string;
  collected_at_ms?: number;
  pm2_binary?: string;
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

export type UpdateCheckResult = {
  IsUpdateAvailable: boolean;
  CurrentVersion: string;
  LatestVersion: string;
  LatestRelease?: {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    prerelease: boolean;
    draft: boolean;
    html_url: string;
  };
  CheckTime: string;
  Error?: string;
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
  logPath: raw?.logPath ?? raw?.LogPath ?? raw?.log_path,
  containerID: raw?.containerID ?? raw?.containerID ?? raw?.ContainerID ?? raw?.container_id,
  ContainerID: raw?.ContainerID ?? raw?.containerID ?? raw?.container_id,
  commitSHA: raw?.commitSHA ?? raw?.CommitSHA ?? raw?.commit_sha,
  branch: raw?.branch ?? raw?.Branch,
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
  renameFile: async (old_path: string, new_path: string) => (await http.patch("/files/rename", { old_path, new_path })).data,
  uploadFile: async (
    path: string,
    file: File,
    opts?: { relativePath?: string; onUploadProgress?: (progress: { loaded: number; total?: number }) => void },
  ) => {
    const form = new FormData();
    form.append("path", path);
    form.append("file", file);
    if (opts?.relativePath) form.append("relative_path", opts.relativePath);
    return (
      await http.post("/files/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => opts?.onUploadProgress?.({ loaded: event.loaded, total: event.total }),
      })
    ).data;
  },
  deleteFile: async (path: string) => (await http.delete("/files", { params: { path } })).data,
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

  listDockerVolumes: async () => (await http.get<{ volumes: DockerVolume[] }>("/docker/volumes")).data,
  createDockerVolume: async (name: string, driver?: string) =>
    (await http.post("/docker/volumes/create", { name, driver: driver || undefined })).data,
  deleteDockerVolume: async (name: string) => (await http.delete(`/docker/volume/${encodeURIComponent(name)}`)).data,
  pruneDockerVolumes: async () => (await http.post("/docker/volumes/prune")).data,

  listDockerNetworks: async () => (await http.get<{ networks: DockerNetwork[] }>("/docker/networks")).data,
  pruneDockerNetworks: async () => (await http.post("/docker/networks/prune")).data,

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

  detectProjectRuntime: async (projectPath: string) =>
    (await http.post<RuntimeDetectionResult>("/runtime/detect", { project_path: projectPath })).data,
  pm2HostStatus: async () => (await http.get<{ installed: boolean; binary?: string; native?: boolean }>("/pm2/status")).data,

  listPm2Processes: async () => (await http.get<{ processes: Pm2Process[] }>("/pm2/processes")).data,

  pm2Logs: async (name: string, lines = 200) =>
    (await http.get<{ name: string; lines: number; log: string }>(`/pm2/processes/${encodeURIComponent(name)}/logs`, { params: { lines } })).data,

  // Fetch docker container logs by name or id
  dockerLogs: async (nameOrID: string, lines = 200) =>
    (
      await http.get<{ name: string; lines: number; log: string }>(
        `/docker/container/${encodeURIComponent(nameOrID)}/logs`,
        { params: { lines } }
      )
    ).data,

  // Get single deployment details
  getDeployment: async (id: number) => normalizeDeployment((await http.get<any>(`/deployments/${id}`)).data),

  pm2Action: async (name: string, action: "start" | "stop" | "restart" | "delete") => {
    const enc = encodeURIComponent(name);
    if (action === "delete") {
      return (await http.delete(`/pm2/processes/${enc}`)).data;
    }
    return (await http.post(`/pm2/processes/${enc}/${action}`)).data;
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

  caddyReload: async () => (await http.post("/proxy/caddy/reload", {})).data,
  getDNSGuide: async () => (await http.get("/proxy/dns/guide")).data,
  checkUpdates: async () => (await http.get<UpdateCheckResult>("/updates/check")).data,

  githubBridgeInfo: async () => (await http.get<GitHubBridgeInfo>("/github/bridge")).data,
  githubSaveInstallation: async (installationId: number) =>
    (await http.post<GitHubInstallationRecord>("/github/installations", { installationId })).data,
  githubListRepositories: async () => (await http.get<{ repositories: GitHubRepositorySummary[] }>("/github/repositories")).data.repositories,
  githubImportProject: async (input: { repository: string; branch?: string }) =>
    (await http.post<GitHubImportResponse>("/projects/import/github", input)).data,

  githubInstall: async () => (await http.get<{ install: string; setup: GitHubSetupInfo }>("/github/install")).data,
  githubSetup: async () => (await http.get<GitHubSetupResponse>("/github/setup")).data,
  githubConnect: async (input: {
    auth_type: "app" | "pat" | "ssh";
    installation_id?: number;
    account_login?: string;
    account_type?: string;
    pat?: string;
    ssh_private_key?: string;
  }) => (await http.post("/github/connect", input)).data,
  githubRepositories: async (params?: { installation_id?: number; q?: string; selected?: boolean; refresh?: boolean; page?: number; per_page?: number }) =>
    (await http.get<{ repositories: GitHubRepository[] }>("/github/repositories", { params })).data.repositories,
  githubImport: async (input: {
    connection_id?: number;
    installation_id?: number;
    repository_id?: number;
    full_name: string;
    name?: string;
    owner?: string;
    clone_url?: string;
    ssh_url?: string;
    branch?: string;
    deployment_mode?: "docker" | "native" | "pm2";
    project_name?: string;
    auth_type?: "app" | "pat" | "ssh";
    pat?: string;
    ssh_private_key?: string;
    environment?: Record<string, string>;
    selected?: boolean;
    refresh?: boolean;
    import_as_project?: boolean;
    working_directory?: string;
  }) => (await http.post<GitHubImportPreview>("/github/import", input)).data,
  githubDisconnect: async () => (await http.post("/github/disconnect", {})).data,
};
