const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function resolveApiBaseUrl(apiUrl: string) {
  try {
    const configured = new URL(apiUrl);
    const host = configured.hostname.toLowerCase();
    const isLocalConfig = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const browserHost = window.location.hostname.toLowerCase();
    const isBrowserLocal = browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "::1";
    if (isLocalConfig && !isBrowserLocal) {
      return `${window.location.origin}${configured.pathname}`;
    }
    return configured.toString().replace(/\/$/, "");
  } catch {
    return apiUrl.replace(/\/$/, "");
  }
}

function inferWsBaseUrl(apiUrl: string) {
  try {
    const u = new URL(apiUrl);
    const protocol = u.protocol === "https:" ? "wss:" : "ws:";
    const cleanPath = u.pathname.replace(/\/api\/v1\/?$/, "");
    return `${protocol}//${u.host}${cleanPath}/ws`;
  } catch {
    return "ws://localhost:8080/ws";
  }
}

const apiBaseUrl = resolveApiBaseUrl(rawApiBaseUrl);

export const env = {
  apiBaseUrl,
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? inferWsBaseUrl(apiBaseUrl),
  appName: "SkyPort",
} as const;
