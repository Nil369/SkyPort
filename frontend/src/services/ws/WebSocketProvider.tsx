import * as React from "react";

import { env } from "@/app/env";
import { WebSocketHub } from "@/services/ws/WebSocketHub";
import { WsContext, type WsContextValue } from "@/services/ws/context";
import { useAuthStore } from "@/stores/authStore";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  const hub = React.useMemo(() => new WebSocketHub(env.wsBaseUrl), []);
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const on = () => force();
    window.addEventListener("skyport:ws", on as any);
    return () => window.removeEventListener("skyport:ws", on as any);
  }, []);

  React.useEffect(() => {
    if (status === "authenticated" && token) {
      // Keep the metrics stream warm for the dashboard + global indicators.
      hub.connect("metrics", "/metrics", { token, parseJson: true });
      return;
    }
    hub.closeAll();
  }, [hub, status, token]);

  const value = React.useMemo<WsContextValue>(
    () => ({
      hub,
      getStatus: (key) => hub.getState(key).status,
    }),
    [hub]
  );

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}
