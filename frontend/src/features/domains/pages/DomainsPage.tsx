import * as React from "react";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import toast from "react-hot-toast";

import { Plus } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

import { platformApi } from "@/features/platform/api";

import { DomainForm } from "@/components/domains/DomainForm";
import { DomainList } from "@/components/domains/DomainList";
import { CaddyStatusCard } from "@/components/domains/CaddyStatusCard";
import { DeleteDomainDialog } from "@/components/domains/DeleteDomainDialog";
import { DNSConfigurationGuide } from "@/components/domains/DNSConfigurationGuide";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DomainMapping {
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

export function DomainsPage() {
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);

  const [editingMapping, setEditingMapping] =
    React.useState<DomainMapping | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] =
    React.useState(false);

  const [deleteTargetId, setDeleteTargetId] =
    React.useState<number | null>(null);

  const [deleteTargetDomain, setDeleteTargetDomain] =
    React.useState("");

  // Queries
  const caddyStatus = useQuery({
    queryKey: ["caddy-status"],
    queryFn: platformApi.caddyStatus,
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: platformApi.listProjects,
  });

  const mappings = useQuery({
    queryKey: ["domain-mappings"],
    queryFn: async () => {
      const result =
        await platformApi.listDomainMappings();

      return result.mappings as DomainMapping[];
    },
  });

  // Save Mutation
  const saveMapping = useMutation({
    mutationFn: async (data: {
      domain: string;
      port: number;
      email: string;
      projectId: string;
      enableSSL: boolean;
      middlewares: string;
    }) => {
      const payload = {
        domain: data.domain,
        port: data.port,
        type: "caddy" as const,
        enable_ssl: data.enableSSL,
        email: data.email || undefined,
        project_id: data.projectId
          ? Number(data.projectId)
          : null,
        middlewares: data.middlewares || "[]",
      };

      if (editingMapping) {
        await platformApi.updateDomainMapping(
          editingMapping.id,
          payload
        );
      } else {
        await platformApi.createDomainMapping(payload);
      }
    },

    onSuccess: async () => {
      toast.success(
        editingMapping
          ? "Domain updated successfully"
          : "Domain added successfully"
      );

      setDialogOpen(false);
      setEditingMapping(null);

      await qc.invalidateQueries({
        queryKey: ["domain-mappings"],
      });
    },

    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error?.message ||
        error?.message ||
        "Failed to save mapping"
      );
    },
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: number) => {
      return await platformApi.deleteDomainMapping(id);
    },

    onMutate: async (id) => {
      await qc.cancelQueries({
        queryKey: ["domain-mappings"],
      });

      const previousMappings =
        qc.getQueryData<DomainMapping[]>([
          "domain-mappings",
        ]);

      qc.setQueryData<DomainMapping[]>(
        ["domain-mappings"],
        (old = []) =>
          old.filter((mapping) => mapping.id !== id)
      );

      return { previousMappings };
    },

    onError: (error: any, _, context) => {
      if (context?.previousMappings) {
        qc.setQueryData(
          ["domain-mappings"],
          context.previousMappings
        );
      }

      const message =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Failed to delete domain mapping";

      toast.error(message);
    },

    onSuccess: () => {
      toast.success(
        "Domain mapping deleted successfully"
      );

      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      setDeleteTargetDomain("");
    },

    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["domain-mappings"],
      });
    },
  });

  // Caddy
  const installCaddy = useMutation({
    mutationFn: () => platformApi.caddyInstall(true),

    onSuccess: () => {
      toast.success("Caddy installation started");

      setTimeout(() => {
        qc.invalidateQueries({
          queryKey: ["caddy-status"],
        });
      }, 2000);
    },
  });

  const reloadCaddy = useMutation({
    mutationFn: () => platformApi.caddyReload(),

    onSuccess: () => {
      toast.success("Caddy reloaded");
    },
  });

  // Handlers
  const handleAdd = () => {
    setEditingMapping(null);
    setDialogOpen(true);
  };

  const handleEdit = (mapping: DomainMapping) => {
    setEditingMapping(mapping);
    setDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    const mapping = mappings.data?.find(
      (m) => m.id === id
    );

    if (!mapping) return;

    setDeleteTargetId(id);
    setDeleteTargetDomain(mapping.domain);
    setDeleteDialogOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        title="Domains & Reverse Proxy"
        subtitle="Manage domains and HTTPS routing"
      />

      <div className="space-y-6">
        <CaddyStatusCard
          status={caddyStatus.data || null}
          isLoading={caddyStatus.isLoading}
          onInstall={async () => {
            await installCaddy.mutateAsync();
          }}

          onReload={async () => {
            await reloadCaddy.mutateAsync();
          }}
        />

        {/* Table Section */}
        <DomainList
          mappings={mappings.data || []}
          projects={projects.data || []}
          isLoading={mappings.isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          deletingId={
            deleteMapping.isPending
              ? deleteTargetId || undefined
              : undefined
          }
          headerAction={
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          }
        />

        <DNSConfigurationGuide />

        {/* Add/Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingMapping
                  ? "Edit Domain Mapping"
                  : "Add Domain Mapping"}
              </DialogTitle>

              <DialogDescription>
                Configure reverse proxy routing and HTTPS.
              </DialogDescription>
            </DialogHeader>

            <DomainForm
              projects={projects.data || []}
              mappings={mappings.data || []}
              editingMappingId={editingMapping?.id}
              isEditing={!!editingMapping}
              initialData={
                editingMapping
                  ? {
                    domain: editingMapping.domain,
                    port: String(editingMapping.port),
                    email:
                      editingMapping.email || "",
                    projectId:
                      editingMapping.project_id
                        ? String(
                          editingMapping.project_id
                        )
                        : "",
                    enableSSL:
                      editingMapping.enable_ssl,
                    middlewares:
                      editingMapping.middlewares || "[]",
                  }
                  : undefined
              }
              onSubmit={(data) =>
                saveMapping.mutateAsync(data)
              }
              onCancel={() => {
                setDialogOpen(false);
                setEditingMapping(null);
              }}
              submitLabel={
                editingMapping
                  ? "Save Changes"
                  : "Create Mapping"
              }
            />
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <DeleteDomainDialog
          isOpen={deleteDialogOpen}
          domain={deleteTargetDomain}
          isDeleting={deleteMapping.isPending}
          onConfirm={async () => {
            if (deleteTargetId) {
              await deleteMapping.mutateAsync(deleteTargetId);
            }
          }}
          onCancel={() => {
            setDeleteDialogOpen(false);
            setDeleteTargetId(null);
          }}
        />
      </div>
    </PageShell>
  );
}