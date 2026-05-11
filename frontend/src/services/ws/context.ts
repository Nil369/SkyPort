import * as React from "react";

import { WebSocketHub } from "@/services/ws/WebSocketHub";
import type { WsStatus } from "@/services/ws/types";

export type WsContextValue = {
  hub: WebSocketHub;
  getStatus: (key: string) => WsStatus;
};

export const WsContext = React.createContext<WsContextValue | null>(null);
