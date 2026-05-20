import { useQuery } from "@tanstack/react-query";

import { platformApi } from "@/features/platform/api";

export function useGitHubBridgeInfo() {
	return useQuery({
		queryKey: ["github", "bridge"],
		queryFn: platformApi.githubBridgeInfo,
	});
}
