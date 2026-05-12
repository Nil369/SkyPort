import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { env } from "@/app/env";
import { useAuthStore } from "@/stores/authStore";
import { usersApi } from "@/features/users/api";

export function ProfilePage() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const token = useAuthStore((s) => s.accessToken);

  const me = useQuery({ queryKey: ["users", "me"], queryFn: usersApi.meProfile });

  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (me.data?.name) setName(me.data.name);
  }, [me.data?.name]);

  const [curPw, setCurPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");

  const patch = useMutation({
    mutationFn: () => usersApi.patchMe(name.trim()),
    onSuccess: (u) => {
      setUser(u);
      qc.invalidateQueries({ queryKey: ["users", "me"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Profile saved");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Save failed"),
  });

  const pw = useMutation({
    mutationFn: () => usersApi.changePassword(curPw, newPw),
    onSuccess: () => {
      setCurPw("");
      setNewPw("");
      toast.success("Password updated — please sign in again on other devices");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Password change failed"),
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const avatar = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["users", "me"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      const u = await usersApi.meProfile();
      setUser(u);
      toast.success("Avatar updated");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Upload failed"),
  });

  const avatarSrc = React.useMemo(() => {
    if (!me.data?.avatar_relative_path || !token) return null;
    const base = env.apiBaseUrl.replace(/\/$/, "");
    return `${base}/users/me/avatar?token=${encodeURIComponent(token)}`;
  }, [me.data?.avatar_relative_path, token]);

  const initials = React.useMemo(() => {
    const n = me.data?.name ?? me.data?.email ?? name ?? "";
    const parts = String(n).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [me.data, name]);

  const avatarBgStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (avatarSrc) return undefined;
    const seed = String(me.data?.email ?? me.data?.name ?? "a");
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hue}deg 75% 94%), hsl(${(hue + 30) % 360}deg 70% 86%))`,
    };
  }, [me.data, avatarSrc]);

  return (
    <PageShell>
      <PageHeader title="Profile" subtitle="Identity, credentials, and avatar for this operator session." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-mono text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div
                className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70"
                style={avatarBgStyle}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="size-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="font-mono text-sm text-muted-foreground">{initials}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Display name</Label>
                  <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={me.data?.email ?? ""} readOnly className="font-mono text-sm opacity-80" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(me.data?.roles ?? []).map((r) => (
                    <Badge key={r} variant="info" className="font-mono text-[10px] uppercase">
                      {r}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={patch.isPending || !name.trim()} onClick={() => patch.mutate()}>
                    Save profile
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) avatar.mutate(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={avatar.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatar.isPending ? "Uploading…" : "Upload avatar"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="font-mono text-base">Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="p-cur">Current password</Label>
              <Input id="p-cur" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className="font-mono text-sm" autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-new">New password</Label>
              <Input id="p-new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="font-mono text-sm" autoComplete="new-password" />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pw.isPending || curPw.length < 8 || newPw.length < 8}
              onClick={() => pw.mutate()}
            >
              Update password
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
