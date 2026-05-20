import { ArrowRight, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectGitHubButton } from "@/features/github/components/ConnectGitHubButton";
import { GitHubStatusCard } from "@/features/github/components/GitHubStatusCard";
import { useGitHubBridgeInfo } from "@/features/github/hooks/useGitHubBridgeInfo";

export function GitHubSettingsPage() {
	const bridgeQuery = useGitHubBridgeInfo();

	return (
		<PageShell>
			<PageHeader
				title="GitHub Integration"
				subtitle="Connect the GitHub App bridge and prepare repository imports for this SkyPort instance."
				right={<ConnectGitHubButton />}
			/>

			<GitHubStatusCard bridge={bridgeQuery.data ?? null} onRefresh={() => bridgeQuery.refetch()} />

			<Card>
				<CardHeader>
					<CardTitle>How it works</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3 text-sm text-muted-foreground">
					<div className="flex flex-wrap gap-2">
						<Badge variant="info">Bridge redirect</Badge>
						<Badge variant="success">Installation token</Badge>
						<Badge>Repository import</Badge>
					</div>
					<p>
						SkyPort sends you to the central GitHub bridge, GitHub returns the installation ID, and this panel stores it locally so repositories can be fetched and imported.
					</p>
					<p>
						The backend never stores your GitHub private key or installation token in the UI. Only the installation ID is saved in SQLite.
					</p>
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<a href="/github/repositories">
								Open repositories
								<ArrowRight className="ml-2 size-4" />
							</a>
						</Button>
						<Button variant="outline" asChild>
							<a href="https://skyport.akashhalder.in/api/github/health" target="_blank" rel="noreferrer">
								<ShieldCheck className="mr-2 size-4" />
								Bridge health
							</a>
						</Button>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
