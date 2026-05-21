import { useState } from "react";
import { Plus, X } from "lucide-react";
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
  isEditing?: boolean;
  initialData?: {
    domain: string;
    port: string;
    email: string;
    projectId: string;
    enableSSL: boolean;
  };
  onSubmit: (data: {
    domain: string;
    port: number;
    email: string;
    projectId: string;
    enableSSL: boolean;
  }) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function DomainForm({
  projects,
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

  const isValid =
    domain.trim().length > 0 &&
    port.trim().length > 0 &&
    !isNaN(Number(port)) &&
    Number(port) > 0 &&
    Number(port) <= 65535;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (!isValid) {
        setError("Please fill in all required fields correctly");
        return;
      }

      await onSubmit({
        domain: domain.trim(),
        port: Number(port),
        email: email.trim(),
        projectId,
        enableSSL,
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <select
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={submitting}
            >
              <option value="">No project (optional)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* SSL Configuration */}
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
