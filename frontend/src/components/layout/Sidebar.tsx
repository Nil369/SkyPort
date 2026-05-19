
import * as React from "react";
import { NavLink, useNavigate } from "react-router";
import {
  Activity,
  Container,
  FolderTree,
  Globe,
  LayoutDashboard,
  Rocket,
  Settings,
  Terminal,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Code2,
  LogOut,
  Cpu,
  Store,
  Users,
  Server,
  ShieldCheck,
  EllipsisVertical,
  Layers3,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/features/auth/api";
import { PERMS, can } from "@/lib/permissions";
import { env } from "@/app/env";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; need?: string };

const items: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: Boxes },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/files", label: "Files", icon: FolderTree, need: PERMS.filesystemRead },
  { to: "/code-editor", label: "Code Editor", icon: Code2, need: PERMS.filesystemWrite },
  { to: "/docker", label: "Docker", icon: Container, need: PERMS.dockerManage },
  { to: "/terminal", label: "Terminal", icon: Terminal, need: PERMS.terminalAccess },
  { to: "/process-manager", label: "Process Manager", icon: Cpu },
  { to: "/domains", label: "Domains", icon: Globe },
  { to: "/metrics", label: "Metrics", icon: Activity, need: PERMS.metricsView },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/github", label: "GitHub", icon: GitBranch },
  { to: "/team", label: "Team", icon: Users, need: PERMS.usersManage },
  { to: "/servers", label: "Cluster", icon: Server, need: PERMS.serversManage },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logoutLocal = useAuthStore((s) => s.logoutLocal);
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const { resetAndRestartTour } = useOnboardingTour();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      logoutLocal();
      toast.success("Signed out");
      navigate("/login", { replace: true });
    },
    onError: () => {
      logoutLocal();
      navigate("/login", { replace: true });
    },
  });

  const token = useAuthStore((s) => s.accessToken);
  const avatarSrc = React.useMemo(() => {
    if (!user?.avatar_relative_path || !token) return null;
    const base = env.apiBaseUrl.replace(/\/$/, "");
    return `${base}/users/me/avatar?token=${encodeURIComponent(token)}`;
  }, [user?.avatar_relative_path, token]);

  const initials = React.useMemo(() => {
    const n = user?.name ?? user?.email ?? "";
    const parts = String(n).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [user]);

  const avatarBgStyle = React.useMemo<React.CSSProperties>(() => {
    if (avatarSrc) return {} as React.CSSProperties;
    const seed = String(user?.email ?? user?.name ?? "a");
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return { background: `linear-gradient(135deg, hsl(${hue}deg 75% 94%), hsl(${(hue + 30) % 360}deg 70% 86%))` };
  }, [user, avatarSrc]);

  const role = user?.roles?.[0] ?? (can(user?.permissions, PERMS.usersManage) ? "admin" : "viewer");

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-18" : "w-65"
      )}
    >
      <div className={cn("flex items-center gap-2 p-4", collapsed && "justify-center")}
      >
        <Logo variant={collapsed ? "mark" : "full"} size={collapsed ? "sm" : "lg"} />
        <div className={cn("ml-auto", collapsed && "ml-0")}
        >
          <Button
            variant="outline"
            size={collapsed ? "icon" : "icon-sm"}
            onClick={toggle}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>
      </div>
      <Separator className="opacity-60" />
      <nav className="p-2" data-tour="sidebar">
        <ul className="space-y-1">
          {items
            .filter((it) => !it.need || can(user?.permissions, it.need))
            .map(({ to, label, icon: Icon }) => {
              const getTourAttribute = (path: string) => {
                if (path === "/projects") return "projects";
                if (path === "/deployments") return "deployments";
                if (path === "/files") return "files";
                if (path === "/docker") return "docker";
                if (path === "/terminal") return "terminal";
                if (path === "/process-manager") return "process-manager";
                if (path === "/marketplace") return "marketplace";
                return undefined;
              };

              return (
              <li key={to}>
                <NavLink
                  to={to}
                  data-tour={getTourAttribute(to)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isActive &&
                      "font-semibold bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--sidebar-border),transparent_40%)] " +
                      "hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                      collapsed && "justify-center px-2"
                    )
                  }
                >
                  <Icon className="size-4" />
                  <span className={cn(collapsed && "hidden")}>{label}</span>
                </NavLink>
              </li>
            );
            })}
        </ul>
      </nav>

      <div className="mt-auto border-t border-sidebar-border/80 p-2">
        <div className="relative mb-2">
          <button
            type="button"
            data-tour="profile-menu"
            onClick={() => setActionsOpen((state) => !state)}
            className={cn(
              "group w-full rounded-2xl border border-white/10 bg-linear-to-br from-slate-900 via-slate-800 to-slate-950 p-3 text-left shadow-[0_10px_35px_rgba(15,23,42,0.35)] transition-transform hover:-translate-y-0.5",
              collapsed && "p-2"
            )}
          >
            <div className={cn("flex items-start gap-3 mt-2", collapsed && "justify-center")}>
              <div className="relative">
                <div className="size-12 overflow-hidden rounded-full border border-white/15" style={avatarBgStyle}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" className="size-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-mono text-sm font-semibold text-slate-950">{initials}</span>
                    </div>
                  )}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border border-slate-950 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
                )} />
              </div>
              <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{user?.name ?? "User"}</div>
                    <div className="truncate text-[11px] text-slate-300">{user?.email ?? "No email"}</div>
                  </div>
                </div>
                <div className="rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-0.5 max-w-22 my-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                  {role}
                </div>
              </div>
              <span className={cn("self-center text-white/80", collapsed && "hidden")}>
                <EllipsisVertical className="size-4" />
              </span>
            </div>
          </button>

          {actionsOpen && !collapsed ? (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-20 rounded-2xl border border-border/80 bg-background/95 p-2 shadow-2xl backdrop-blur">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                onClick={() => {
                  setActionsOpen(false);
                  resetAndRestartTour();
                }}
              >
                <Sparkles className="size-4" /> Start Tour
              </button>
              <NavLink to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted" onClick={() => setActionsOpen(false)}>
                <Layers3 className="size-4" /> View Profile
              </NavLink>
              <NavLink to="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted" onClick={() => setActionsOpen(false)}>
                <Settings className="size-4" /> Settings
              </NavLink>
              <NavLink to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted" onClick={() => setActionsOpen(false)}>
                <ShieldCheck className="size-4" /> Admin Panel
              </NavLink>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => {
                  setActionsOpen(false);
                  logout.mutate();
                }}
                disabled={logout.isPending}
              >
                <LogOut className="size-4" /> Logout
              </button>
            </div>
          ) : null}
        </div>

      </div>
    </aside>
  );
}
