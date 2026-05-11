const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

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

export const env = {
  apiBaseUrl,
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? inferWsBaseUrl(apiBaseUrl),
  appName: "SkyPort",
} as const;
