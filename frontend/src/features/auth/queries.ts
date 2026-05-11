import { useQuery } from "@tanstack/react-query";

import { authApi } from "@/features/auth/api";

export function useSetupStatus() {
  return useQuery({
    queryKey: ["auth", "setupStatus"],
    queryFn: authApi.setupStatus,
    staleTime: 10_000,
  });
}
