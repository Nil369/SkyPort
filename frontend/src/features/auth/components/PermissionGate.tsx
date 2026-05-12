import * as React from "react";
import { Navigate } from "react-router";

import { useAuthStore } from "@/stores/authStore";
import { can } from "@/lib/permissions";

export function PermissionGate({
  need,
  children,
  fallbackTo = "/overview",
}: {
  need: string;
  children: React.ReactNode;
  fallbackTo?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const ok = can(user?.permissions, need);
  if (!ok) {
    return <Navigate to={fallbackTo} replace />;
  }
  return <>{children}</>;
}
