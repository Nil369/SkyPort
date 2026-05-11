import * as React from "react";

import { QueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterProvider } from "@/providers/ToasterProvider";
import { AuthBootstrapper } from "@/features/auth/providers/AuthBootstrapper";
import { WebSocketProvider } from "@/services/ws/WebSocketProvider";

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="skyport-theme">
      <QueryProvider>
        <AuthBootstrapper>
          <WebSocketProvider>
            {children}
            <ToasterProvider />
          </WebSocketProvider>
        </AuthBootstrapper>
      </QueryProvider>
    </ThemeProvider>
  );
}
