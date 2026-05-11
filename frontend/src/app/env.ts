function defaultApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL;
  if (explicit != null && String(explicit).trim() !== "") {
    return String(explicit).trim().replace(/\/$/, "");
  }
  // Dev: Vite on :5173 talks to API on :8080. Production: same origin as the Go server.
  if (import.meta.env.DEV) {
    return "http://localhost:8080/api/v1";
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/v1`;
  }
  return "/api/v1";
}

const rawApiBaseUrl = defaultApiBaseUrl();

function resolveApiBaseUrl(apiUrl: string) {
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const configured = new URL(apiUrl, base);
    const host = configured.hostname.toLowerCase();
    const isLocalConfig = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const browserHost =
      typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isBrowserLocal =
      browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "::1";
    if (typeof window !== "undefined" && isLocalConfig && !isBrowserLocal) {
      return `${window.location.origin}${configured.pathname}`.replace(/\/$/, "");
    }
    return configured.toString().replace(/\/$/, "");
  } catch {
    return apiUrl.replace(/\/$/, "");
  }
}

function inferWsBaseUrl(apiUrl: string) {
  const explicit = import.meta.env.VITE_WS_BASE_URL;
  if (explicit != null && String(explicit).trim() !== "") {
    return String(explicit).trim().replace(/\/$/, "");
  }
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const u = new URL(apiUrl, base);
    const protocol = u.protocol === "https:" ? "wss:" : "ws:";
    const cleanPath = u.pathname.replace(/\/api\/v1\/?$/, "");
    return `${protocol}//${u.host}${cleanPath}/ws`;
  } catch {
    if (typeof window !== "undefined" && window.location?.origin) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/ws`;
    }
    return "ws://localhost:8080/ws";
  }
}

const apiBaseUrl = resolveApiBaseUrl(rawApiBaseUrl);

export const env = {
  apiBaseUrl,
  wsBaseUrl: inferWsBaseUrl(apiBaseUrl),
  appName: "SkyPort",
} as const;
