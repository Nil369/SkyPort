import * as React from "react";
import { Navigate, useLocation } from "react-router";

import { useAuthStore } from "@/stores/authStore";
import { FullscreenLoading } from "@/components/state/FullscreenLoading";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  if (status === "hydrating") {
    return <FullscreenLoading label="Restoring session" />;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
