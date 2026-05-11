export type WsStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export type WsMessageHandler<T = unknown> = (msg: T) => void;
