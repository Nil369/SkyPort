import * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type GitHubRepositorySummary } from "@/features/platform/api";

export function ImportRepositoryDialog({
	open,
	repository,
	isPending,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	repository: GitHubRepositorySummary | null;
	isPending?: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (branch: string) => void;
}) {
	const [branch, setBranch] = React.useState("");

	React.useEffect(() => {
		setBranch(repository?.default_branch ?? "main");
	}, [repository]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import Project</DialogTitle>
					<DialogDescription>
						Clone {repository?.full_name ?? "the selected repository"} into your SkyPort workspace.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<div className="text-xs text-muted-foreground">Branch</div>
					<Input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
						Cancel
					</Button>
					<Button onClick={() => onConfirm(branch.trim())} disabled={!repository || isPending}>
						Import Project
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
