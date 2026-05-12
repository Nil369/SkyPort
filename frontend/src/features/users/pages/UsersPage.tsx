import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, UserPlus, Shield, ScrollText, MoreHorizontal } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usersApi, type UserRow, type ActivityItem } from "@/features/users/api";

const ROLES = ["owner", "admin", "developer", "viewer"] as const;

function roleBadgeVariant(role: string): "default" | "success" | "danger" | "info" | "warning" {
  switch (role) {
    case "owner":
      return "info";
    case "admin":
      return "danger";
    case "developer":
      return "success";
    default:
      return "warning";
  }
}

export function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"directory" | "activity">("directory");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserRow | null>(null);

  const users = useQuery({ queryKey: ["users", "list"], queryFn: usersApi.listUsers });
  const activity = useQuery({
    queryKey: ["audit", "activity"],
    queryFn: usersApi.listActivity,
    enabled: tab === "activity",
  });

  const filtered = React.useMemo(() => {
    const list = users.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.roles.some((r) => r.toLowerCase().includes(s))
    );
  }, [users.data, q]);

  const invite = useMutation({
    mutationFn: usersApi.invite,
    onSuccess: (data) => {
      toast.success("User invited");
      qc.invalidateQueries({ queryKey: ["users", "list"] });
      setInviteOpen(false);
      toast.success(`Temporary password (copy now): ${data.temporary_password}`, { duration: 12_000 });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Invite failed"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { enabled?: boolean; role?: string } }) => usersApi.patchUser(id, body),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["users", "list"] });
      setEditUser(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Update failed"),
  });

  const remove = useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: () => {
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["users", "list"] });
      setEditUser(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Delete failed"),
  });

  const resetPw = useMutation({
    mutationFn: (id: number) => usersApi.resetPassword(id),
    onSuccess: (data) => {
      toast.success(`New password: ${data.temporary_password}`, { duration: 12_000 });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Reset failed"),
  });

  return (
    <PageShell>
      <PageHeader
        title="Team"
        subtitle="Operators, roles, and audit trail for this control plane."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "directory" ? "default" : "outline"} size="sm" onClick={() => setTab("directory")}>
              <Shield className="size-4" /> Directory
            </Button>
            <Button variant={tab === "activity" ? "default" : "outline"} size="sm" onClick={() => setTab("activity")}>
              <ScrollText className="size-4" /> Activity
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite
            </Button>
          </div>
        }
      />

      {tab === "directory" ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-mono tracking-tight">User directory</CardTitle>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 font-mono text-sm" placeholder="Filter name, email, role…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No users match this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{u.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{u.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <Badge key={r} variant={roleBadgeVariant(r)} className="font-mono text-[10px] uppercase">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 font-mono text-xs">
                            <span className={cn("size-2 rounded-full", u.enabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-zinc-500")} />
                            {u.enabled ? "active" : "disabled"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditUser(u)}>
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-mono tracking-tight">Activity log</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (activity.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">No audit events yet.</div>
            ) : (
              <div className="max-h-[480px] overflow-auto rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activity.data ?? []).map((row: ActivityItem) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.action}</TableCell>
                        <TableCell className="font-mono text-xs">{row.target}</TableCell>
                        <TableCell className="max-w-[240px] truncate font-mono text-xs text-muted-foreground">{row.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {inviteOpen ? (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onSubmit={(v) => invite.mutate(v)}
          loading={invite.isPending}
        />
      ) : null}

      {editUser ? (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(body) => patch.mutate({ id: editUser.id, body })}
          onDelete={() => remove.mutate(editUser.id)}
          onResetPassword={() => resetPw.mutate(editUser.id)}
          loading={patch.isPending || remove.isPending || resetPw.isPending}
        />
      ) : null}
    </PageShell>
  );
}

function InviteModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (v: { email: string; role: string }) => void;
  loading: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<string>("developer");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="w-full max-w-md border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="font-mono text-base">Invite operator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" className="font-mono text-sm" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-role">Role</Label>
            <select
              id="inv-role"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs outline-none"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={loading || !email.trim()}
              onClick={() => onSubmit({ email: email.trim(), role })}
            >
              Send invite
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSave,
  onDelete,
  onResetPassword,
  loading,
}: {
  user: UserRow;
  onClose: () => void;
  onSave: (body: { enabled?: boolean; role?: string }) => void;
  onDelete: () => void;
  onResetPassword: () => void;
  loading: boolean;
}) {
  const [enabled, setEnabled] = React.useState(user.enabled);
  const [role, setRole] = React.useState(user.roles[0] ?? "developer");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="w-full max-w-lg border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="font-mono text-base">Edit operator</CardTitle>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Roles bundle permissions (RBAC). Pick a role to change what this operator can touch in the control plane.
          </p>
          <div className="space-y-2">
            <Label>Role</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs outline-none"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Account enabled
          </label>
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="secondary" size="sm" className="font-mono text-xs" onClick={onResetPassword} disabled={loading}>
              Reset password
            </Button>
            <Button type="button" variant="destructive" size="sm" className="font-mono text-xs" onClick={onDelete} disabled={loading}>
              Delete user
            </Button>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={loading} onClick={() => onSave({ enabled, role })}>
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
