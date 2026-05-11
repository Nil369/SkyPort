import * as React from "react";
import { PlugZap, Search } from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/services/ws/useWebSocket";

function statusDot(status: string) {
  switch (status) {
    case "connected":
      return "bg-emerald-500";
    case "connecting":
    case "reconnecting":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-muted-foreground";
  }
}

export function TopBar({ className }: { className?: string }) {
  const { getStatus } = useWebSocket();
  const ws = getStatus("metrics");

  return (
    <header
      className={cn(
        "sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60",
        className
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={cn("size-2 rounded-full", statusDot(ws))} />
          <div className="text-xs text-muted-foreground">Realtime</div>
        </div>

        <Card className="flex-1 px-3 py-1.5 bg-card/60 border-border/60">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search anything… (Command palette coming soon)"
              className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </Card>

        <Button variant="outline" size="icon" aria-label="Connection details" disabled>
          <PlugZap className="size-4" />
        </Button>

        <ModeToggle />
      </div>
    </header>
  );
}
