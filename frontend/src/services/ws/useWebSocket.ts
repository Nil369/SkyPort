import * as React from "react";

import { WsContext } from "@/services/ws/context";

export function useWebSocket() {
  const ctx = React.useContext(WsContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
