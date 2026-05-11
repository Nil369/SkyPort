
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
  UserCircle2,
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

const items = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: Boxes },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/terminal", label: "Terminal", icon: Terminal },
  { to: "/files", label: "Files", icon: FolderTree },
  { to: "/code-editor", label: "Code Editor", icon: Code2 },
  { to: "/docker", label: "Docker", icon: Container },
  { to: "/metrics", label: "Metrics", icon: Activity },
  { to: "/domains", label: "Domains", icon: Globe },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logoutLocal = useAuthStore((s) => s.logoutLocal);
  const navigate = useNavigate();

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

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-18" : "w-65"
      )}
    >
      <div className={cn("flex items-center gap-2 p-4", collapsed && "justify-center")}
      >
        <Logo variant={collapsed ? "mark" : "full"} size={collapsed ? "sm" : "md"} />
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
      <nav className="p-2">
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive &&
  "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--sidebar-border),transparent_40%)] " + 
  "hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                    collapsed && "justify-center px-2"
                  )
                }
              >
                <Icon className="size-4" />
                <span className={cn(collapsed && "hidden")}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto border-t border-sidebar-border/70 p-2">
        <div className={cn("mb-2 flex items-center gap-2 rounded-lg bg-sidebar-primary/80 p-2", collapsed && "justify-center")}>
          <UserCircle2 className="size-5 shrink-0 text-gray-100" />
          <div className={cn("min-w-0", collapsed && "hidden")}>
            <div className="truncate text-xs font-semibold text-white">{user?.name ?? "User"}</div>
            <div className="truncate text-[11px] text-gray-200">{user?.email ?? "No email"}</div>
          </div>
        </div>
        <Button
          variant="destructive"
          className={cn("w-full justify-start gap-2", collapsed && "justify-center px-0")}
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="size-4" />
          <span className={cn(collapsed && "hidden")}>Logout</span>
        </Button>
      </div>
    </aside>
  );
}
