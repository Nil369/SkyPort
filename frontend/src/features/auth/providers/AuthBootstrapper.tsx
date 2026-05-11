import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/features/auth/api";

export function AuthBootstrapper({ children }: { children: React.ReactNode }) {
  const { status, accessToken, hydrate, setUser, logoutLocal } = useAuthStore();

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  const me = useQuery({
    queryKey: ["auth", "me"],
    enabled: status === "authenticated" && !!accessToken,
    queryFn: authApi.me,
    retry: false,
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  React.useEffect(() => {
    if (!me.error) return;
    const statusCode = (me.error as AxiosError<any>)?.response?.status;
    // Keep local session on transient/network failures; only logout on auth failures.
    if (statusCode === 401 || statusCode === 403) {
      logoutLocal();
    }
  }, [me.error, logoutLocal]);

  return <>{children}</>;
}
