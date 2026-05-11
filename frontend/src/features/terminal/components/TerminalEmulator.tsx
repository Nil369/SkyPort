import * as React from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { Eraser } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useWebSocket } from "@/services/ws/useWebSocket";

export function TerminalEmulator() {
  const { effectiveTheme } = useTheme();
  const token = useAuthStore((s) => s.accessToken);
  const { hub, getStatus } = useWebSocket();

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<Terminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme:
        effectiveTheme === "dark"
          ? { background: "#0B1020", foreground: "#F8FAFC", cursor: "#22D3EE" }
          : { background: "#FFFFFF", foreground: "#0F172A", cursor: "#2563EB" },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.focus();
    window.setTimeout(() => {
      fit.fit();
      term.focus();
    }, 80);

    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims) {
        hub.send(
          "terminal",
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        );
      }
    });

    ro.observe(containerRef.current);

    const onData = term.onData((data) => {
      hub.send("terminal", data);
    });

    return () => {
      onData.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [effectiveTheme, hub]);

  React.useEffect(() => {
    if (!token) return;
    hub.connect("terminal", "/terminal", { token, parseJson: false });
    const t = window.setTimeout(() => {
      const dims = fitRef.current?.proposeDimensions();
      if (dims) {
        hub.send("terminal", JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      }
    }, 250);

    const unsub = hub.subscribe<string>("terminal", (msg) => {
      if (!termRef.current) return;
      if (typeof msg !== "string") return;
      termRef.current.write(msg);
    });

    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [hub, token]);

  const status = getStatus("terminal");

  return (
    <div className="relative h-full w-full bg-background">
      <div className="absolute right-3 top-2 z-10 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={() => termRef.current?.clear()}
        >
          <Eraser className="size-3.5" />
          Clear
        </Button>
        <div className="text-[11px] text-muted-foreground">WS: {status}</div>
      </div>
      <div ref={containerRef} className="h-full w-full" onClick={() => termRef.current?.focus()} />
    </div>
  );
}
