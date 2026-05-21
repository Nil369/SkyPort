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
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";

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
                        Domain
                      </TableHead>

                      <TableHead>
                        Target
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
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {mapping.domain}
                                </span>

                                {mapping.email && (
                                  <span className="text-xs text-muted-foreground">
                                    {
                                      mapping.email
                                    }
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              <code className="rounded bg-muted px-2 py-1 text-xs">
                                localhost:
                                {
                                  mapping.port
                                }
                              </code>
                            </TableCell>

                            <TableCell>
                              {mapping.enable_ssl ? (
                                <Badge>
                                  HTTPS
                                </Badge>
                              ) : (
                                <Badge variant="success">
                                  HTTP
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell>
                              {projectName}
                            </TableCell>

                            <TableCell>
                              {createdAt}
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                {/* Open */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={(
                                    e
                                  ) => {
                                    e.preventDefault();

                                    e.stopPropagation();

                                    window.open(
                                      domainUrl,
                                      "_blank",
                                      "noopener,noreferrer"
                                    );
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
    </Card>
  );
}