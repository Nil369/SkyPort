import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import toast from "react-hot-toast";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { platformApi } from "@/features/platform/api";

export function GitHubCompletePage() {
	const location = useLocation();
	const navigate = useNavigate();
	const [error, setError] = React.useState<string | null>(null);
	const installationId = React.useMemo(() => {
		const params = new URLSearchParams(location.search);
		const raw = params.get("installation_id")?.trim() ?? "";
		if (!raw) return "";
		const parsed = Number(raw);
		return Number.isFinite(parsed) && parsed > 0 ? raw : "";
	}, [location.search]);

	const saveMutation = useMutation({
		mutationFn: platformApi.githubSaveInstallation,
		onSuccess: async () => {
			toast.success("GitHub installation saved");
			await navigate("/github/repositories", { replace: true });
		},
		onError: (err: any) => {
			setError(err?.response?.data?.error?.message ?? err?.message ?? "Failed to save installation");
		},
	});

	React.useEffect(() => {
		if (!installationId) {
			setError("Missing installation_id query parameter.");
			return;
		}
		if (saveMutation.isPending || saveMutation.isSuccess) return;
		saveMutation.mutate(Number(installationId));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [installationId]);

	return (
		<PageShell className="max-w-2xl">
			<PageHeader title="GitHub setup" subtitle="Finalizing the GitHub App installation." />
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{saveMutation.isError || error ? <AlertCircle className="size-5 text-destructive" /> : <CheckCircle2 className="size-5 text-emerald-500" />}
						{saveMutation.isError || error ? "Setup failed" : saveMutation.isSuccess ? "Installation saved" : "Saving installation"}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 text-sm text-muted-foreground">
					<p>
						{saveMutation.isPending
							? "Verifying the installation ID and storing it in SkyPort."
							: saveMutation.isSuccess
								? "The installation is saved. Redirecting to the repository list."
								: "Waiting for the GitHub bridge to return the installation ID."}
					</p>
					{saveMutation.isError || error ? (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Unable to complete setup</AlertTitle>
							<AlertDescription>{error ?? "Unknown error"}</AlertDescription>
						</Alert>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => navigate("/github/repositories")} disabled={saveMutation.isPending && !saveMutation.isSuccess}>
							Continue to repositories
						</Button>
						<Button variant="outline" onClick={() => navigate("/settings/github")}>Open GitHub settings</Button>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
