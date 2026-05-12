export type User = {
  id: number;
  name: string;
  email: string;
  enabled?: boolean;
  avatar_relative_path?: string;
  roles?: string[];
  permissions?: string[];
};

export type AuthResponse = {
  user: User;
  accessToken: string;
  tokenType: "Bearer" | string;
  expiresAtUTC: string;
};

export type AuthResponseWire = {
  user: User;
  access_token: string;
  token_type: string;
  expires_at: string;
  refresh_token?: string;
};

export type SetupStatus = {
  needsSetup: boolean;
};
