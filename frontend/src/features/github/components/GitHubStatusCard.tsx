import { ExternalLink, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectGitHubButton } from "@/features/github/components/ConnectGitHubButton";
import { type GitHubBridgeInfo } from "@/features/platform/api";

export function GitHubStatusCard({
	bridge,
	installation,
	repositoryCount,
	onRefresh,
}: {
	bridge?: GitHubBridgeInfo | null;
	installation?: { installation_id: number } | null;
	repositoryCount?: number;
	onRefresh?: () => void;
}) {
	const connected = Boolean(installation?.installation_id);

	return (
		<Card>
			<CardHeader className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<CardTitle>GitHub App</CardTitle>
					<div className="flex flex-wrap gap-2">
						<Badge variant={connected ? "success" : "warning"}>{connected ? "Connected" : "Not connected"}</Badge>
						{bridge?.has_app_config ? <Badge variant="info">App configured</Badge> : <Badge variant="warning">App missing</Badge>}
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4 text-sm">
				<div className="grid gap-3 sm:grid-cols-3">
					<Stat label="Installation" value={connected ? String(installation?.installation_id ?? "-") : "Not saved"} />
					<Stat label="Repositories" value={repositoryCount == null ? "-" : String(repositoryCount)} />
					<Stat label="Bridge" value={bridge?.bridge_url ?? "https://skyport.akashhalder.in"} />
				</div>
				<div className="flex flex-wrap gap-2">
					<ConnectGitHubButton size="sm" />
					{onRefresh ? (
						<Button size="sm" variant="outline" onClick={onRefresh}>
							<RefreshCw className="mr-2 size-4" />
							Refresh
						</Button>
					) : null}
					{bridge?.connect_url ? (
						<Button asChild size="sm" variant="ghost">
							<a href={bridge.connect_url} target="_blank" rel="noreferrer">
								<ExternalLink className="mr-2 size-4" />
								Open bridge
							</a>
						</Button>
					) : null}
				</div>
				{connected ? <div className="text-xs text-muted-foreground">Installation ID is stored locally on this SkyPort instance and used to fetch repositories.</div> : <div className="text-xs text-muted-foreground">Install the GitHub App through the bridge, then complete the handoff to save the installation ID here.</div>}
			</CardContent>
		</Card>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border/70 bg-muted/20 p-3">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 break-all text-sm font-medium">{value}</div>
		</div>
	);
}
