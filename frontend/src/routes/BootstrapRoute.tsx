import { Navigate } from "react-router";

import { useAuthStore } from "@/stores/authStore";
import { useSetupStatus } from "@/features/auth/queries";
import { FullscreenLoading } from "@/components/state/FullscreenLoading";

export function BootstrapRoute() {
  const { status } = useAuthStore();
  const setup = useSetupStatus();

  if (status === "hydrating" || setup.isLoading) {
    return <FullscreenLoading label="Booting SkyPort ..." />;
  }

  if (setup.data?.needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (status === "authenticated") {
    return <Navigate to="/overview" replace />;
  }

  return <Navigate to="/login" replace />;
}
