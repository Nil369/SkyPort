import { CalendarDays, ChevronRight, Lock, Unlock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type GitHubRepositorySummary } from "@/features/platform/api";

export function RepositoryCard({
	repository,
	onImport,
}: {
	repository: GitHubRepositorySummary;
	onImport: (repository: GitHubRepositorySummary) => void;
}) {
	return (
		<Card className="h-full">
			<CardHeader className="space-y-2">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle className="text-base">{repository.full_name}</CardTitle>
						<div className="text-xs text-muted-foreground">{repository.owner ?? repository.full_name.split("/")[0]}</div>
					</div>
					<Badge variant={repository.private ? "warning" : "success"} className="shrink-0">
						{repository.private ? <Lock className="mr-1 size-3" /> : <Unlock className="mr-1 size-3" />}
						{repository.private ? "Private" : "Public"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-2 text-sm text-muted-foreground">
					<div className="flex items-center justify-between gap-3">
						<span className="inline-flex items-center gap-2"><ChevronRight className="size-4" /> Default branch</span>
						<span className="font-medium text-foreground">{repository.default_branch || "main"}</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="inline-flex items-center gap-2"><CalendarDays className="size-4" /> Updated</span>
						<span className="font-medium text-foreground">{formatDate(repository.updated_at)}</span>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => onImport(repository)}>Import Project</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function formatDate(value?: string) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}
