import { http } from "@/services/api/http";

export type MarketplaceApp = {
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string;
  image_url?: string;
  install_modes: string[];
  ports: number[];
  env: Record<string, string>;
  healthcheck: string;
  runtime: string;
  memory_requirements: string;
  cpu_requirements: string;
  supported_os: string[];
  tags?: string[];
  featured?: boolean;
  trending?: boolean;
};

export type MarketplaceInstallRow = {
  id: number;
  app_slug: string;
  install_mode: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export const marketplaceApi = {
  listApps: async () => (await http.get<{ apps: MarketplaceApp[] }>("/marketplace/apps")).data.apps,
  listInstalls: async () => (await http.get<{ installs: MarketplaceInstallRow[] }>("/marketplace/installs")).data.installs,
  recordInstall: async (body: { app_slug: string; install_mode: "docker" | "native"; status?: string; notes?: string }) =>
    (await http.post("/marketplace/installs", body)).data,
};
