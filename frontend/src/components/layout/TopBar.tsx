import { Bell, PlugZap, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/services/ws/useWebSocket";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { platformApi } from "@/features/platform/api";

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
  const { hub, getStatus } = useWebSocket();
  const token = useAuthStore((s) => s.accessToken);
  const metricsWs = getStatus("metrics");
  const terminalWs = getStatus("terminal");
  const connected = metricsWs === "connected" || terminalWs === "connected";
  const isConnected = metricsWs === "connected" || terminalWs === "connected";
  const ws = isConnected ? "connected" : metricsWs;
  const reconnectable = metricsWs === "disconnected" || metricsWs === "error" || metricsWs === "reconnecting";

  const { setShowReleaseNotes, dismissedUpdateVersion, dismissUpdate } = useUIStore();
  const { data: update } = useQuery({
    queryKey: ["update-check"],
    queryFn: platformApi.checkUpdates,
    refetchInterval: 1000 * 60 * 60,
    staleTime: 1000 * 60 * 30,
  });

  const hasUpdate = !!update?.IsUpdateAvailable && dismissedUpdateVersion !== update?.LatestVersion;

  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialSearch = params.get("q") ?? "";
  const [searchValue, setSearchValue] = useState(initialSearch);

  useEffect(() => {
    setSearchValue(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (searchValue.trim() === initialSearch.trim()) {
      return;
    }
    const handle = window.setTimeout(() => {
      updateSearch(searchValue);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchValue, initialSearch]);

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(location.search);
    if (value.trim()) {
      next.set("q", value.trim());
    } else {
      next.delete("q");
    }
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60",
        className
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center" data-tour="realtime">
            <span className={cn("absolute size-2.5 rounded-full", statusDot(ws), connected && "animate-ping opacity-70")} />
            <span className={cn("relative size-2 rounded-full", statusDot(ws), connected && "shadow-[0_0_8px_rgba(16,185,129,0.95)]")} />
          </div>
          <div
            className={cn(
              "text-xs text-muted-foreground transition-all",
              connected && "animate-pulse text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            )}
          >
            Realtime
          </div>
        </div>

        <Card className="flex-1 px-3 py-1.5 bg-card/60 border-border/60" data-tour="search">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search projects and deployments…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  updateSearch(searchValue);
                }
              }}
              className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </Card>

        <Button
          variant="outline"
          size="icon"
          aria-label={connected ? "Disconnect realtime" : "Reconnect realtime"}
          title={connected ? "Disconnect realtime" : "Reconnect realtime"}
          onClick={() => {
            if (connected) {
              hub.close("metrics");
              return;
            }
            if (!token) return;
            hub.connect("metrics", "/metrics", { token, parseJson: true });
          }}
          className={cn(
            "transition-all",
            connected && "border-emerald-400/50 text-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_16px_rgba(16,185,129,0.35)]",
            reconnectable && "border-amber-400/50 text-amber-500",
            !connected && !reconnectable && "text-muted-foreground"
          )}
        >
          <PlugZap className={cn("size-4", connected && "animate-pulse")} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative text-muted-foreground hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {hasUpdate && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-background animate-in zoom-in duration-300">
                  1
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
               <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifications</h3>
               {hasUpdate && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold shadow-sm shadow-red-500/20">1 New</span>}
            </div>
            <div className="max-h-87.5 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
              {hasUpdate ? (
                <div 
                  className="p-4 flex gap-3 hover:bg-muted/50 cursor-pointer transition-colors group" 
                  onClick={() => setShowReleaseNotes(true)}
                >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Update Available</p>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">{update.LatestVersion}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">A new version of SkyPort is ready. Check out the latest features and bug fixes.</p>
                      <p className="text-[10px] text-primary font-bold mt-2 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        View Release Notes <span className="text-xs">→</span>
                      </p>
                    </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/40">
                    <Bell className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-xs font-medium italic">No new notifications</p>
                </div>
              )}
            </div>
            {hasUpdate && (
              <div className="border-t bg-muted/10 p-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-[10px] h-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/5 font-semibold transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (update?.LatestVersion) {
                      dismissUpdate(update.LatestVersion);
                    }
                  }}
                >
                  Clear all notifications
                </Button>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ModeToggle />
      </div>
    </header>
  );
}
