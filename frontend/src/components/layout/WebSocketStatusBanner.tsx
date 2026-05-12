import * as React from "react";
import { Activity, WifiOff } from "lucide-react";

import { useWebSocket } from "@/services/ws/useWebSocket";

export function WebSocketStatusBanner() {
  const { getStatus } = useWebSocket();
  const [, bump] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const on = () => bump();
    window.addEventListener("skyport:ws", on as EventListener);
    return () => window.removeEventListener("skyport:ws", on as EventListener);
  }, []);

  const metrics = getStatus("metrics");
  if (metrics === "connected" || metrics === "connecting") {
    return null;
  }

  const label =
    metrics === "reconnecting"
      ? "Realtime metrics reconnecting…"
      : metrics === "error"
        ? "Realtime channel error — retrying"
        : "Realtime metrics offline";

  return (
    <div
      className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"
      role="status"
    >
      {metrics === "reconnecting" ? <Activity className="size-4 animate-pulse" /> : <WifiOff className="size-4" />}
      <span className="font-mono text-xs tracking-tight">{label}</span>
    </div>
  );
}
