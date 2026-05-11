import type { WsMessageHandler, WsStatus } from "@/services/ws/types";

type ConnectionOptions = {
  token?: string | null;
  protocols?: string | string[];
  parseJson?: boolean;
  reconnect?: boolean;
};

type ConnectionState = {
  status: WsStatus;
  lastError?: string;
};

export class WebSocketHub {
  private connections = new Map<string, WebSocket>();
  private states = new Map<string, ConnectionState>();
  private handlers = new Map<string, Set<WsMessageHandler<any>>>();
  private reconnectTimers = new Map<string, number>();
  private reconnectAttempts = new Map<string, number>();

  constructor(private baseUrl: string) {}

  getState(key: string): ConnectionState {
    return this.states.get(key) ?? { status: "disconnected" };
  }

  subscribe<T = unknown>(key: string, handler: WsMessageHandler<T>) {
    const set = this.handlers.get(key) ?? new Set();
    set.add(handler as WsMessageHandler<any>);
    this.handlers.set(key, set);
    return () => {
      set.delete(handler as WsMessageHandler<any>);
    };
  }

  connect(key: string, path: string, opts: ConnectionOptions = {}) {
    const existing = this.connections.get(key);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = this.buildUrl(path, opts.token);
    this.setState(key, { status: existing ? "reconnecting" : "connecting" });

    const ws = new WebSocket(url, opts.protocols);
    this.connections.set(key, ws);

    ws.onopen = () => {
      this.reconnectAttempts.set(key, 0);
      this.setState(key, { status: "connected" });
    };

    ws.onmessage = (ev) => {
      const payload = opts.parseJson ? safeJsonParse(ev.data) : ev.data;
      const subs = this.handlers.get(key);
      if (!subs || subs.size === 0) return;
      subs.forEach((fn) => fn(payload));
    };

    ws.onerror = () => {
      // Browser doesn't provide much detail here.
      this.setState(key, { status: "error", lastError: "websocket_error" });
    };

    ws.onclose = () => {
      this.connections.delete(key);
      this.setState(key, { status: "disconnected" });
      if (opts.reconnect !== false) {
        this.scheduleReconnect(key, path, opts);
      }
    };
  }

  send(key: string, data: string) {
    const ws = this.connections.get(key);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(data);
    return true;
  }

  close(key: string) {
    const ws = this.connections.get(key);
    if (!ws) return;
    try {
      ws.close();
    } finally {
      this.connections.delete(key);
      this.setState(key, { status: "disconnected" });
    }
  }

  closeAll() {
    Array.from(this.connections.keys()).forEach((k) => this.close(k));
  }

  private buildUrl(path: string, token?: string | null) {
    const base = this.baseUrl.replace(/\/$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(base + p);
    if (token) url.searchParams.set("token", token);
    return url.toString();
  }

  private scheduleReconnect(key: string, path: string, opts: ConnectionOptions) {
    const attempt = (this.reconnectAttempts.get(key) ?? 0) + 1;
    this.reconnectAttempts.set(key, attempt);

    // Exponential backoff with cap: 0.5s -> 1s -> 2s -> ... -> 8s
    const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1));

    const existing = this.reconnectTimers.get(key);
    if (existing) window.clearTimeout(existing);

    const id = window.setTimeout(() => {
      this.connect(key, path, { ...opts, reconnect: true });
    }, delay);

    this.reconnectTimers.set(key, id);
  }

  private setState(key: string, next: ConnectionState) {
    this.states.set(key, next);
    window.dispatchEvent(new CustomEvent("skyport:ws", { detail: { key, state: next } }));
  }
}

function safeJsonParse(data: any) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
