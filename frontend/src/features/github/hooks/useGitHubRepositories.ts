import { useQuery } from "@tanstack/react-query";

import { platformApi } from "@/features/platform/api";

export function useGitHubRepositories() {
	return useQuery({
		queryKey: ["github", "repositories"],
		queryFn: platformApi.githubListRepositories,
		retry: false,
	});
}
