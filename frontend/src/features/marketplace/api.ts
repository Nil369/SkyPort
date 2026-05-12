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

export const marketplaceApi = {
  listApps: async () => (await http.get<{ apps: MarketplaceApp[] }>("/marketplace/apps")).data.apps,
};
