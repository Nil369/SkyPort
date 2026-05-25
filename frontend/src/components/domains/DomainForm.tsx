import { useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface Project {
  id: number;
  name: string;
  description?: string;
}

interface DomainFormProps {
  projects: Project[];
  mappings: Array<{ id: number; port: number; domain: string }>;
  editingMappingId?: number | null;
  isEditing?: boolean;
  initialData?: {
    domain: string;
    port: string;
    email: string;
    projectId: string;
    enableSSL: boolean;
    middlewares?: string;
  };
  onSubmit: (data: {
    domain: string;
    port: number;
    email: string;
    projectId: string;
    enableSSL: boolean;
    middlewares: string;
  }) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function DomainForm({
  projects,
  mappings,
  editingMappingId,
  isEditing = false,
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Add Domain",
}: DomainFormProps) {
  const [domain, setDomain] = useState(initialData?.domain || "");
  const [port, setPort] = useState(initialData?.port || "3000");
  const [email, setEmail] = useState(initialData?.email || "");
  const [projectId, setProjectId] = useState(initialData?.projectId || "");
  const [enableSSL, setEnableSSL] = useState(initialData?.enableSSL ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "middlewares" | "ssl">("details");
  const [middlewares, setMiddlewares] = useState<string[]>(() => {
    try {
      return initialData?.middlewares ? JSON.parse(initialData.middlewares) : [];
    } catch {
      return [];
    }
  });

  const isValid =
    domain.trim().length > 0 &&
    port.trim().length > 0 &&
    !isNaN(Number(port)) &&
    Number(port) > 0 &&
    Number(port) <= 65535;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValid) {
      setError("Please fill in all required fields correctly");
      return;
    }

    const portNum = Number(port);
    const portConflict = mappings.find(
      (m) => m.port === portNum && (!isEditing || m.id !== editingMappingId)
    );
    if (portConflict) {
      setError(`Port ${portNum} is already used by reverse proxy for domain ${portConflict.domain}`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        domain: domain.trim(),
        port: portNum,
        email: email.trim(),
        projectId,
        enableSSL,
        middlewares: JSON.stringify(middlewares.filter((mw) => mw.trim().length > 0)),
      });
    } catch (err: any) {
      setError(err?.message || "Failed to save domain mapping");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          {isEditing ? "Edit Domain Mapping" : "Add New Domain"}
        </CardTitle>
        <CardDescription>
          {isEditing
            ? "Update the domain mapping configuration"
            : "Create a reverse proxy mapping from a domain to a local port"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Tabs Navigation */}
        <div className="flex border-b border-border mb-4">
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "middlewares"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("middlewares")}
          >
            Middlewares
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "ssl"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("ssl")}
          >
            SSL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Details Tab */}
          {activeTab === "details" && (
            <div className="space-y-4">
              {/* Domain Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Domain
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="example.com or app.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={submitting}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your domain name (without protocol)
                </p>
              </div>

              {/* Port Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Target Port
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="3000"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={submitting}
                  min="1"
                  max="65535"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Local port running your application
                </p>
              </div>

              {/* Project Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Associated Project</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={submitting}
                      className="w-full h-10 flex items-center justify-between rounded-lg border border-input bg-background px-3 text-sm cursor-pointer"
                      aria-label="Select project"
                    >
                      <span className="truncate text-sm">
                        {projectId ? projects.find((p) => String(p.id) === projectId)?.name : 'No project (optional)'}
                      </span>
                      <ChevronDown className="ml-2" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setProjectId('')}>No project (optional)</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {projects.map((p) => (
                      <DropdownMenuItem key={p.id} className="cursor-pointer" onClick={() => setProjectId(String(p.id))}>
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Middlewares Tab */}
          {activeTab === "middlewares" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 border border-border/50 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Caddy Middleware Directives</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each middleware is a raw Caddy directive line injected into the site block.
                  These run <em>before</em> the reverse_proxy directive.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["encode gzip zstd", "header X-Frame-Options DENY", "basicauth /* { user $2a$14$hash }", "rate_limit { zone global { rate 10r/s } }",  "log { output file /var/log/access.log }"].map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className="text-[10px] bg-background border rounded px-1.5 py-0.5 hover:bg-accent transition-colors cursor-pointer font-mono"
                      onClick={() => setMiddlewares([...middlewares, ex])}
                    >
                      + {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {middlewares.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No middlewares added yet. Click an example above or add one manually.
                  </p>
                ) : (
                  middlewares.map((mw, index) => (
                    <div key={index} className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Middleware {index + 1}
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="e.g. encode gzip zstd"
                          value={mw}
                          onChange={(e) => {
                            const updated = [...middlewares];
                            updated[index] = e.target.value;
                            setMiddlewares(updated);
                          }}
                          disabled={submitting}
                          className="font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setMiddlewares(middlewares.filter((_, i) => i !== index));
                          }}
                          disabled={submitting}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMiddlewares([...middlewares, ""])}
                disabled={submitting}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Middleware
              </Button>
            </div>
          )}

          {/* SSL Tab */}
          {activeTab === "ssl" && (
            <div className="space-y-3 rounded-lg bg-muted/50 p-3 border">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableSSL"
                  checked={enableSSL}
                  onChange={(e) => setEnableSSL(e.target.checked)}
                  disabled={submitting}
                  className="h-4 w-4 rounded border-input"
                />
                <label
                  htmlFor="enableSSL"
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  Enable HTTPS / Auto TLS
                </label>
                <Badge className="bg-green-500/20 text-green-700 border-green-200">
                  ✓ Recommended
                </Badge>
              </div>

              {enableSSL && (
                <div className="space-y-2 mt-3 pt-3 border-t">
                  <label className="text-sm font-medium">TLS Email</label>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email for Let's Encrypt certificate renewals (optional but
                    recommended)
                  </p>
                </div>
              )}

              {!enableSSL && (
                <p className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded">
                  ⚠️ HTTP only - not recommended for production
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={submitting || !isValid}
              className="flex-1"
            >
              {submitting ? "Saving..." : submitLabel}
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={submitting}
                className="flex-1"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
