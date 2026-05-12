import { http } from "@/services/api/http";

export type ClusterServer = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
  address?: string;
  fingerprint?: string;
  last_seen_at?: string;
  status: string;
};

export type AgentRecord = {
  id: number;
  created_at: string;
  updated_at: string;
  server_id: number;
  name: string;
  version: string;
};

export type CreateClusterServerInput = {
  name: string;
  address?: string;
  fingerprint?: string;
};

export const clusterApi = {
  listServers: async () => (await http.get<{ servers: ClusterServer[] }>("/cluster/servers")).data.servers,
  listAgents: async () => (await http.get<{ agents: AgentRecord[] }>("/cluster/agents")).data.agents,
  createServer: async (input: CreateClusterServerInput) => (await http.post<{ server: ClusterServer }>("/cluster/servers", input)).data.server,
};
