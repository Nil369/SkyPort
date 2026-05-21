import * as React from "react";

import {
  Globe,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileCode,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DomainMapping {
  id: number;
  domain: string;
  port: number;
  type: "caddy" | "nginx";
  enable_ssl: boolean;
  email?: string;
  project_id?: number;
  created_at: string;
  updated_at: string;
  middlewares?: string;
}

interface Project {
  id: number;
  name: string;
}

interface Props {
  mappings: DomainMapping[];
  projects: Project[];
  isLoading?: boolean;
  onEdit: (mapping: DomainMapping) => void;
  onDelete: (id: number) => void;
  deletingId?: number;
  headerAction?: React.ReactNode;
}

const ITEMS_PER_PAGE = 15;

export function DomainList({
  mappings,
  projects,
  isLoading,
  onEdit,
  onDelete,
  deletingId,
  headerAction,
}: Props) {
  const [page, setPage] = React.useState(1);

  const [search, setSearch] = React.useState("");

  const [viewingMapping, setViewingMapping] = React.useState<DomainMapping | null>(null);
  const [copied, setCopied] = React.useState(false);

  const filteredMappings = React.useMemo(() => {
    return mappings.filter((mapping) => {
      const projectName = projects.find(
        (p) => p.id === mapping.project_id
      )?.name;

      return (
        mapping.domain
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        String(mapping.port).includes(search) ||
        projectName
          ?.toLowerCase()
          .includes(search.toLowerCase())
      );
    });
  }, [mappings, search, projects]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredMappings.length / ITEMS_PER_PAGE
    )
  );

  const paginatedMappings =
    filteredMappings.slice(
      (page - 1) * ITEMS_PER_PAGE,
      page * ITEMS_PER_PAGE
    );

  React.useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Domain Mappings</CardTitle>

          <p className="mt-1 text-sm text-muted-foreground">
            {filteredMappings.length} total mappings
          </p>
        </div>

        {headerAction}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            placeholder="Search domains, ports, projects..."
            className="pl-10"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableBody>
                {Array.from({
                  length: 5,
                }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="h-10 animate-pulse rounded-md bg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Empty State */}
        {!isLoading &&
          filteredMappings.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Globe className="mb-4 h-10 w-10 text-muted-foreground/40" />

              <h3 className="text-lg font-semibold">
                No Domain Mappings
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Create your first domain mapping.
              </p>
            </div>
          )}

        {/* Table */}
        {!isLoading &&
          filteredMappings.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        Route
                      </TableHead>

                      <TableHead>
                        SSL
                      </TableHead>

                      <TableHead>
                        Project
                      </TableHead>

                      <TableHead>
                        Created
                      </TableHead>

                      <TableHead className="w-35 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {paginatedMappings.map(
                      (mapping) => {
                        const projectName =
                          projects.find(
                            (p) =>
                              p.id ===
                              mapping.project_id
                          )?.name || "—";

                        const domainUrl = `${mapping.enable_ssl
                            ? "https"
                            : "http"
                          }://${mapping.domain}`;

                        const createdAt =
                          mapping.created_at &&
                            !isNaN(
                              new Date(
                                mapping.created_at
                              ).getTime()
                            )
                            ? new Date(
                              mapping.created_at
                            ).toLocaleDateString()
                            : "Unknown";

                        return (
                          <TableRow
                            key={`${mapping.id}-${mapping.domain}-${mapping.port}`}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2 flex-wrap">
                                <code className=" rounded-md border border-blue-500/20 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-100 shadow-sm backdrop-blur-md">
                                  {mapping.enable_ssl ? "https" : "http"}://{mapping.domain}
                                </code>
                                <span className="text-muted-foreground font-bold text-base select-none">→</span>
                                <code className="rounded bg-muted/60 border border-border/40 px-2.5 py-1 text-xs">
                                  http://localhost:{mapping.port}
                                </code>
                              </div>
                              {mapping.email && (
                                <span className="text-xs text-muted-foreground mt-0.5 block">
                                  {mapping.email}
                                </span>
                              )}
                            </TableCell>

                            <TableCell>
                              {mapping.enable_ssl ? (
                                <Badge variant="success">
                                  HTTPS
                                </Badge>
                              ) : (
                                <Badge>
                                  HTTP
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell>
                              {projectName !== "—" ? (
                                <Badge variant="info">
                                  {projectName}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {createdAt}
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {/* View Config */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  title="View config"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setViewingMapping(mapping);
                                  }}
                                >
                                  <FileCode className="h-4 w-4" />
                                </Button>

                                {/* Open */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(domainUrl, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>

                                {/* Edit */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  onClick={(
                                    e
                                  ) => {
                                    e.preventDefault();

                                    e.stopPropagation();

                                    onEdit(
                                      mapping
                                    );
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                {/* Delete */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="destructive"
                                  className="shrink-0"
                                  disabled={
                                    deletingId ===
                                    mapping.id
                                  }
                                  onClick={(
                                    e
                                  ) => {
                                    e.preventDefault();

                                    e.stopPropagation();

                                    console.log(
                                      "Delete button clicked:",
                                      mapping.id
                                    );

                                    onDelete(
                                      Number(
                                        mapping.id
                                      )
                                    );
                                  }}
                                >
                                  {deletingId ===
                                    mapping.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing{" "}
                  {Math.min(
                    (page - 1) *
                    ITEMS_PER_PAGE +
                    1,
                    filteredMappings.length
                  )}{" "}
                  to{" "}
                  {Math.min(
                    page *
                    ITEMS_PER_PAGE,
                    filteredMappings.length
                  )}{" "}
                  of{" "}
                  {filteredMappings.length}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() =>
                      setPage(
                        (p) => p - 1
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-15 text-center text-sm">
                    {page} / {totalPages}
                  </div>

                  <Button
                    size="icon"
                    variant="outline"
                    disabled={
                      page === totalPages
                    }
                    onClick={() =>
                      setPage(
                        (p) => p + 1
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
      </CardContent>

      {/* View Config Dialog */}
      <Dialog open={!!viewingMapping} onOpenChange={(open) => { if (!open) { setViewingMapping(null); setCopied(false); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Caddy Config
            </DialogTitle>
            <DialogDescription>
              Generated Caddyfile snippet for <code className="font-semibold">{viewingMapping?.domain}</code>
            </DialogDescription>
          </DialogHeader>
          {viewingMapping && (() => {
            const lines: string[] = [];
            lines.push(`${viewingMapping.domain} {`);
            if (viewingMapping.enable_ssl && viewingMapping.email) {
              lines.push(`  tls ${viewingMapping.email}`);
            }
            // middlewares
            try {
              const mws: string[] = viewingMapping.middlewares ? JSON.parse(viewingMapping.middlewares) : [];
              mws.filter(Boolean).forEach((mw) => lines.push(`  ${mw}`));
            } catch {}
            lines.push(`  reverse_proxy localhost:${viewingMapping.port}`);
            lines.push(`}`);
            const snippet = lines.join("\n");
            return (
              <div className="relative">
                <pre className="rounded-lg bg-muted/70 border p-4 text-xs font-mono overflow-x-auto whitespace-pre">{snippet}</pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    navigator.clipboard.writeText(snippet);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}