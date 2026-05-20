import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectGitHubButton } from "@/features/github/components/ConnectGitHubButton";
import { GitHubStatusCard } from "@/features/github/components/GitHubStatusCard";
import { ImportRepositoryDialog } from "@/features/github/components/ImportRepositoryDialog";
import { RepositoryList } from "@/features/github/components/RepositoryList";
import { useGitHubBridgeInfo } from "@/features/github/hooks/useGitHubBridgeInfo";
import { useGitHubRepositories } from "@/features/github/hooks/useGitHubRepositories";
import { type GitHubRepositorySummary, platformApi } from "@/features/platform/api";

export function GitHubRepositoriesPage() {
	const qc = useQueryClient();
	const bridgeQuery = useGitHubBridgeInfo();
	const setupQuery = useQuery({
		queryKey: ["github", "setup"],
		queryFn: platformApi.githubSetup,
	});
	const repositoriesQuery = useGitHubRepositories();
	const [selectedRepository, setSelectedRepository] = React.useState<GitHubRepositorySummary | null>(null);
	const [query, setQuery] = React.useState("");
	const [page, setPage] = React.useState(1);
	const pageSize = 25;

	const repositories = repositoriesQuery.data ?? [];
	const emptyState = repositoriesQuery.isError && repositoriesQuery.error && "response" in (repositoriesQuery.error as any) && (repositoriesQuery.error as any).response?.status === 404;

	const filteredRepositories = React.useMemo(() => {
		const search = query.trim().toLowerCase();
		if (!search) return repositories;
		return repositories.filter((repository) => {
			const haystack = [
				repository.name,
				repository.full_name,
				repository.owner,
				repository.description,
				repository.language,
				repository.default_branch,
				repository.license,
				repository.homepage_url,
				...(repository.topics ?? []),
			]
				.filter((value): value is string => Boolean(value))
				.join(" ")
				.toLowerCase();
			return haystack.includes(search);
		});
	}, [query, repositories]);

	const pageCount = Math.max(1, Math.ceil(filteredRepositories.length / pageSize));

	React.useEffect(() => {
		setPage(1);
	}, [query]);

	React.useEffect(() => {
		setPage((current) => Math.min(current, pageCount));
	}, [pageCount]);

	const pagedRepositories = React.useMemo(() => {
		const start = (page - 1) * pageSize;
		return filteredRepositories.slice(start, start + pageSize);
	}, [filteredRepositories, page]);

	const pageStart = filteredRepositories.length === 0 ? 0 : (page - 1) * pageSize + 1;
	const pageEnd = Math.min(page * pageSize, filteredRepositories.length);

	const importMutation = useMutation({
		mutationFn: platformApi.githubImportProject,
		onSuccess: async (result) => {
			toast.success(`Imported ${result.repository.full_name} into ${result.project.name}`);
			setSelectedRepository(null);
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["projects"] }),
				qc.invalidateQueries({ queryKey: ["github", "repositories"] }),
			]);
		},
		onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? err?.message ?? "Failed to import repository"),
	});

	return (
		<PageShell>
			<PageHeader
				title="GitHub Repositories"
				subtitle="Browse repositories from the saved GitHub App installation and import one into SkyPort."
				right={
					<div className="flex flex-wrap gap-2">
						<ConnectGitHubButton variant="secondary" />
						<Button variant="outline" onClick={() => repositoriesQuery.refetch()}>
							<RefreshCw className="mr-2 size-4" />
							Refresh
						</Button>
					</div>
				}
			/>

			<GitHubStatusCard
				bridge={bridgeQuery.data ?? null}
				installation={setupQuery.data?.connections?.[0] ?? null}
				repositoryCount={repositories.length}
				onRefresh={() => repositoriesQuery.refetch()}
			/>

			{repositoriesQuery.isError && !emptyState ? (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Unable to load repositories</AlertTitle>
					<AlertDescription>
						{readErrorMessage(repositoriesQuery.error)}
					</AlertDescription>
				</Alert>
			) : null}

			{emptyState ? (
				<Card>
					<CardContent className="space-y-4 py-8 text-sm text-muted-foreground">
						<div>No installation has been saved yet. Connect GitHub, finish the bridge handoff, then return here.</div>
						<ConnectGitHubButton />
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					<Card className="border-border/60 bg-card/70 shadow-sm">
						<CardContent className="space-y-4 py-4">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div className="space-y-1">
									<div className="text-sm font-semibold text-foreground">Repository browser</div>
									<div className="text-sm text-muted-foreground">Search by repository name, owner, language, description, branch, license, or topic.</div>
								</div>
								<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
									<Badge variant="info">{filteredRepositories.length} repositories</Badge>
									<Badge variant="default">25 per page</Badge>
								</div>
							</div>
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
								<div className="relative flex-1">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Search repositories..."
										className="pl-9 pr-9"
									/>
									{query ? (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
											onClick={() => setQuery("")}
										>
											<X className="size-4" />
										</Button>
									) : null}
								</div>
								<div className="text-sm text-muted-foreground">
									{filteredRepositories.length === 0 ? "No repositories match your search." : `Showing ${pageStart}-${pageEnd} of ${filteredRepositories.length}`}
								</div>
							</div>
						</CardContent>
					</Card>

					{filteredRepositories.length === 0 && !repositoriesQuery.isLoading ? (
						<Card>
							<CardContent className="space-y-3 py-8 text-sm text-muted-foreground">
								<div>{query ? `No repositories matched "${query}".` : "No repositories available for this installation yet."}</div>
								{query ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button> : null}
							</CardContent>
						</Card>
					) : (
						<RepositoryList repositories={pagedRepositories} isLoading={repositoriesQuery.isLoading} onImport={setSelectedRepository} />
					)}

					{filteredRepositories.length > 0 && !repositoriesQuery.isLoading ? (
						<div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
							<div className="text-muted-foreground">
								Page {page} of {pageCount}
							</div>
							<div className="flex items-center gap-2">
								<Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
									<ChevronLeft className="mr-2 size-4" />
									Previous
								</Button>
								<Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>
									Next
									<ChevronRight className="ml-2 size-4" />
								</Button>
							</div>
						</div>
					) : null}
				</div>
			)}

			<ImportRepositoryDialog
				open={Boolean(selectedRepository)}
				repository={selectedRepository}
				isPending={importMutation.isPending}
				onOpenChange={(open) => {
					if (!open) setSelectedRepository(null);
				}}
				onConfirm={(branch) => {
					if (!selectedRepository) return;
					importMutation.mutate({
						repository: selectedRepository.full_name,
						branch: branch || selectedRepository.default_branch,
					});
				}}
			/>
		</PageShell>
	);
}

function readErrorMessage(error: unknown) {
	const err = error as any;
	return err?.response?.data?.error?.message ?? err?.message ?? "GitHub repository fetch failed";
}
