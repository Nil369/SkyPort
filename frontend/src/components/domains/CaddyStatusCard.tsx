import { useState } from "react";
import { Server, Download, RotateCw, Book, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface CaddyStatusData {
  installed: boolean;
  running?: boolean;
  version?: string;
  path?: string;
}

interface CaddyStatusCardProps {
  status: CaddyStatusData | null;
  isLoading?: boolean;
  onInstall: () => Promise<void>;
  onReload: () => Promise<void>;
}

export function CaddyStatusCard({
  status,
  isLoading = false,
  onInstall,
  onReload,
}: CaddyStatusCardProps) {
  const [installing, setInstalling] = useState(false);
  const [reloading, setReloading] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onInstall();
    } finally {
      setInstalling(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-32 rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const installed = status?.installed ?? false;
  const running = status?.running ?? false;
  const version = status?.version ?? "Unknown";

  return (
    <Card className="relative overflow-hidden">
      {/* Top accent bar */}
      <div className={`h-1 w-full ${installed ? "bg-emerald-500" : "bg-amber-500"}`} />

      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Caddy Reverse Proxy
            </CardTitle>
            <CardDescription>
              Reverse proxy engine and HTTPS manager
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Installation Status */}
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Installation
            </div>
            <div className="flex items-center gap-2">
              {installed ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-emerald-600">Installed</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-amber-600">Not Found</span>
                </>
              )}
            </div>
          </div>

          {/* Running Status */}
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Status
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  running ? "bg-emerald-500 animate-pulse" : "bg-muted"
                }`}
              />
              <span
                className={`font-semibold ${
                  running ? "text-emerald-600" : "text-muted-foreground"
                }`}
              >
                {running ? "Running" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Version Info */}
        {installed && (
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Version
            </div>
            <div className="font-mono text-sm">{version || "Unknown"}</div>
            {status?.path && (
              <div className="text-xs text-muted-foreground mt-1 truncate">
                Path: {status.path}
              </div>
            )}
          </div>
        )}

        {/* Info Box */}
        {!installed && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-3">
            <p className="text-sm text-amber-800">
              Caddy is not installed or not found in PATH. Install it to enable
              automatic reverse proxy configuration and HTTPS.
            </p>
          </div>
        )}

        {/* Features */}
        {installed && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span>Auto HTTPS with Let's Encrypt</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span>HTTP/2 support</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span>Automatic certificate renewal</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {!installed && (
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={installing}
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              {installing ? "Installing..." : "Install Caddy"}
            </Button>
          )}

          {installed && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReload}
              disabled={reloading}
              className="flex-1"
            >
              <RotateCw className={`mr-2 h-4 w-4 ${reloading ? "animate-spin" : ""}`} />
              {reloading ? "Reloading..." : "Reload"}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                "https://caddyserver.com/docs/",
                "_blank",
                "noopener,noreferrer"
              )
            }
            className="flex-1"
          >
            <Book className="mr-2 h-4 w-4" />
            Docs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
