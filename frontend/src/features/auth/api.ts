import type { AuthResponse, AuthResponseWire, SetupStatus } from "@/features/auth/types";
import { http } from "@/services/api/http";

function mapAuthResponse(data: AuthResponseWire | AuthResponse): AuthResponse {
  const wire = data as AuthResponseWire;
  if (wire.access_token) {
    return {
      user: wire.user,
      accessToken: wire.access_token,
      tokenType: wire.token_type,
      expiresAtUTC: wire.expires_at,
    };
  }
  return data as AuthResponse;
}

export const authApi = {
  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const { data } = await http.post<AuthResponseWire | AuthResponse>("/auth/login", input);
    return mapAuthResponse(data);
  },
  async register(input: { name: string; email: string; password: string; role?: string }): Promise<AuthResponse> {
    const { data } = await http.post<AuthResponseWire | AuthResponse>("/auth/register", input);
    return mapAuthResponse(data);
  },
  async logout(): Promise<void> {
    await http.post("/auth/logout");
  },
  async me(): Promise<AuthResponse["user"]> {
    const { data } = await http.get<AuthResponse["user"]>("/auth/me");
    return data;
  },
  async setupStatus(): Promise<SetupStatus> {
    // Backend support is optional. If missing, assume setup isn't required.
    try {
      const { data } = await http.get<SetupStatus & { needs_setup?: boolean }>("/auth/setup");
      return { needsSetup: !!(data?.needsSetup ?? data?.needs_setup) };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { needsSetup: false };
      return { needsSetup: false };
    }
  },
};
