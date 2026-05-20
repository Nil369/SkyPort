import * as React from "react";
import {
	Download,
	ExternalLink,
	FileCode2,
	GitFork,
	Lock,
	Star,
	Unlock,
} from "lucide-react";
import StackIcon from "tech-stack-icons";
import {
	siAndroid,
	siAngular,
	siAppwrite,
	siAstro,
	siBun,
	siClojure,
	siCplusplus,
	siCrystal,
	siCss,
	siDart,
	siDocker,
	siDotnet,
	siElixir,
	siErlang,
	siExpress,
	siFastapi,
	siFlutter,
	siFortran,
	siGit,
	siGithub,
	siGo,
	siGraphql,
	siHaskell,
	siHtml5,
	siJavascript,
	siJupyter,
	siKotlin,
	siLaravel,
	siLua,
	siMarkdown,
	siMdx,
	siMongodb,
	siMysql,
	siNestjs,
	siNextdotjs,
	siNodedotjs,
	siOcaml,
	siPerl,
	siPhp,
	siPostgresql,
	siPrisma,
	siPytorch,
	siReact,
	siRedis,
	siRuby,
	siRust,
	siScala,
	siSolidity,
	siSpring,
	siSvelte,
	siSwift,
	siTailwindcss,
	siTensorflow,
	siTypescript,
	siV,
	siVercel,
	siVim,
	siVite,
	siVitest,
	siVuedotjs,
	siYaml,
	siZig,
	siGnubash,
    siEjs,
    siNuxt,
} from "simple-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { type GitHubRepositorySummary } from "@/features/platform/api";

export function RepositoryList({
	repositories,
	isLoading,
	onImport,
}: {
	repositories: GitHubRepositorySummary[];
	isLoading?: boolean;
	onImport: (repository: GitHubRepositorySummary) => void;
}) {
	if (isLoading) {
		return (
			<div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[34%]">Repository</TableHead>
							<TableHead>Visibility</TableHead>
							<TableHead>Language</TableHead>
							<TableHead>Branch</TableHead>
							<TableHead>Updated</TableHead>
							<TableHead>Stars</TableHead>
							<TableHead className="text-right">Action</TableHead>
						</TableRow>
					</TableHeader>

					<TableBody>
						{Array.from({ length: 6 }).map((_, index) => (
							<TableRow key={index}>
								<TableCell className="space-y-2">
									<Skeleton className="h-5 w-56" />
									<Skeleton className="h-4 w-80" />
								</TableCell>

								<TableCell>
									<Skeleton className="h-6 w-20 rounded-full" />
								</TableCell>

								<TableCell>
									<Skeleton className="h-6 w-28 rounded-full" />
								</TableCell>

								<TableCell>
									<Skeleton className="h-4 w-20" />
								</TableCell>

								<TableCell>
									<Skeleton className="h-4 w-32" />
								</TableCell>

								<TableCell>
									<Skeleton className="h-4 w-28" />
								</TableCell>

								<TableCell className="text-right">
									<Skeleton className="ml-auto h-9 w-24" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		);
	}

	if (repositories.length === 0) {
		return null;
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[34%]">Repository</TableHead>
						<TableHead>Visibility</TableHead>
						<TableHead>Language</TableHead>
						<TableHead>Branch</TableHead>
						<TableHead>Updated</TableHead>
						<TableHead>Stars</TableHead>
						<TableHead className="text-right">Action</TableHead>
					</TableRow>
				</TableHeader>

				<TableBody>
					{repositories.map((repository) => (
						<TableRow key={repository.id} className="align-top">
							<TableCell className="space-y-2">
								<div className="flex items-start gap-3">
									<RepositoryOwnerAvatar repository={repository} />

									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<a
												href={
													repository.homepage_url ??
													`https://github.com/${repository.full_name}`
												}
												target="_blank"
												rel="noreferrer"
												className="font-semibold text-foreground hover:underline"
											>
												{repository.full_name}
											</a>

											<Badge
												variant={repository.private ? "warning" : "success"}
												className="h-6 gap-1 px-2 text-[11px]"
											>
												{repository.private ? (
													<Lock className="size-3" />
												) : (
													<Unlock className="size-3" />
												)}

												{repository.private ? "Private" : "Public"}
											</Badge>

											{repository.fork ? (
												<Badge
													variant="default"
													className="h-6 px-2 text-[11px]"
												>
													Fork
												</Badge>
											) : null}

											{repository.archived ? (
												<Badge
													variant="info"
													className="h-6 px-2 text-[11px]"
												>
													Archived
												</Badge>
											) : null}
										</div>

										<p className="line-clamp-2 text-sm text-muted-foreground">
											{repository.description ||
												"No description provided."}
										</p>

										<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
											<span>
												Owner:{" "}
												{repository.owner ??
													repository.full_name.split("/")[0]}
											</span>

											{repository.license ? (
												<span>License: {repository.license}</span>
											) : null}

											{repository.topics?.length ? (
												<span>
													{repository.topics
														.slice(0, 3)
														.join(" · ")}
												</span>
											) : null}

											{repository.language ? (
												<RepositoryLanguageBadge
													language={repository.language}
												/>
											) : null}

											{repository.stargazers_count != null ? (
												<StatPill
													icon={
														<Star className="size-3.5 text-amber-500 fill-amber-500" />
													}
													value={`${formatCompactNumber(
														repository.stargazers_count,
													)} stars`}
												/>
											) : (
												<StatPill
													icon={
														<Star className="size-3.5 text-amber-500 fill-amber-500" />
													}
													value="-"
												/>
											)}
										</div>
									</div>
								</div>
							</TableCell>

							<TableCell>
								<div className="space-y-1 text-sm">
									<div className="font-medium text-foreground">
										{repository.private ? "Private" : "Public"}
									</div>

									<div className="text-xs text-muted-foreground">
										{repository.disabled
											? "Disabled"
											: repository.fork
												? "Forked repository"
												: "Active repository"}
									</div>
								</div>
							</TableCell>

							<TableCell>
								<RepositoryLanguage language={repository.language} />
							</TableCell>

							<TableCell>
								<div className="text-sm font-medium text-foreground">
									{repository.default_branch || "main"}
								</div>
							</TableCell>

							<TableCell>
								<div className="space-y-1 text-sm">
									<div className="font-medium text-foreground">
										{formatDate(repository.updated_at)}
									</div>

									<div className="text-xs text-muted-foreground">
										Updated recently on GitHub
									</div>
								</div>
							</TableCell>

							<TableCell>
								<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
									{repository.stargazers_count != null ? (
										<StatPill
											icon={
												<Star className="size-3.5 text-amber-500 fill-amber-500" />
											}
											value={formatCompactNumber(
												repository.stargazers_count,
											)}
										/>
									) : null}

									{repository.forks_count != null ? (
										<StatPill
											icon={<GitFork className="size-3.5" />}
											value={formatCompactNumber(
												repository.forks_count,
											)}
										/>
									) : null}

									{repository.open_issues_count != null ? (
										<StatPill
											icon={<ExternalLink className="size-3.5" />}
											value={`${repository.open_issues_count} issues`}
										/>
									) : null}
								</div>
							</TableCell>

							<TableCell className="text-right">
								<Button
									size="sm"
									onClick={() => onImport(repository)}
								>
									<Download className="mr-2 size-4" />
									Import Project
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function RepositoryLanguage({ language }: { language?: string }) {
	if (!language) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<FileCode2 className="size-4" />
				<span>Unknown</span>
			</div>
		);
	}

	const icon = resolveLanguageIcon(language);

	return (
		<div className="flex items-center gap-2 text-sm font-medium text-foreground">
			<LanguageIcon icon={icon} label={language} />
			<span>{language}</span>
		</div>
	);
}

function RepositoryLanguageBadge({ language }: { language: string }) {
	const icon = resolveLanguageIcon(language);

	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
			<LanguageIcon icon={icon} label={language} compact />
			<span>{language}</span>
		</span>
	);
}

function RepositoryOwnerAvatar({
	repository,
}: {
	repository: GitHubRepositorySummary;
}) {
	const fallback = (
		repository.owner ??
		repository.full_name.split("/")[0] ??
		"?"
	)
		.slice(0, 2)
		.toUpperCase();

	if (repository.owner_avatar_url) {
		return (
			<img
				src={repository.owner_avatar_url}
				alt={repository.owner ?? repository.full_name.split("/")[0]}
				className="size-12 shrink-0 rounded-full border border-border/60 bg-background object-cover shadow-sm"
			/>
		);
	}

	return (
		<div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-xs font-semibold text-muted-foreground shadow-sm">
			{fallback}
		</div>
	);
}

function LanguageIcon({
	icon,
	label,
	compact,
}: {
	icon: LanguageIconSpec;
	label: string;
	compact?: boolean;
}) {
	const sizeClass = compact ? "size-4" : "size-5";

	if (icon.kind === "stack") {
		return (
			<StackIcon
				name={icon.name as any}
				variant="light"
				className={`${sizeClass} shrink-0`}
			/>
		);
	}

	if (icon.kind === "simple") {
		return (
			<svg
				role="img"
				aria-label={label}
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
				className={`${sizeClass} shrink-0`}
				style={{ color: `#${icon.icon.hex}` }}
				fill="currentColor"
			>
				<path d={icon.icon.path} />
			</svg>
		);
	}

	return (
		<div
			className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50`}
		>
			<FileCode2 className="size-3.5 text-muted-foreground" />
		</div>
	);
}

type LanguageIconSpec =
	| { kind: "stack"; name: string }
	| { kind: "simple"; icon: { path: string; hex: string } }
	| { kind: "generic"; label: string };

function resolveLanguageIcon(language: string): LanguageIconSpec {
	const key = normalizeIconKey(language);

	// SIMPLE ICONS FIRST (MOST RELIABLE)
	const simpleIcon = SIMPLE_LANGUAGE_ICON_MAP[key];

	if (simpleIcon) {
		return {
			kind: "simple",
			icon: simpleIcon,
		};
	}

	// THEN TECH STACK ICONS
	const stackName = TECH_STACK_LANGUAGE_ICON_MAP[key];

	if (stackName) {
		return {
			kind: "stack",
			name: stackName,
		};
	}

	// FALLBACK
	return {
		kind: "generic",
		label: language.slice(0, 2).toUpperCase(),
	};
}

const TECH_STACK_LANGUAGE_ICON_MAP: Record<string, string> = {
	typescript: "typescript",
	javascript: "javascript",
	go: "go",
	golang: "go",
	python: "python",
	react: "react",
	vue: "vuejs",
	vuejs: "vuejs",
	node: "nodejs2",
	nodejs: "nodejs2",
	bun: "bunjs",
	docker: "docker",
	rust: "rust",
	java: "java",
	php: "php",
	ruby: "ruby",
	html: "html5",
	css: "css3",
	csharp: "dotnet",
	"c#": "dotnet",
	bash: "bash",
	shell: "bash",
	sh: "bash",
	mdx: "mdx",
};

const SIMPLE_LANGUAGE_ICON_MAP: Record<
	string,
	{ path: string; hex: string }
> = {
	// WEB
	typescript: siTypescript,
	ts: siTypescript,
	javascript: siJavascript,
	js: siJavascript,
	html: siHtml5,
	html5: siHtml5,
	css: siCss,
	md: siMarkdown,
	markdown: siMarkdown,
	mdx: siMdx,
	ejs: siEjs,
	react: siReact,
	next: siNextdotjs,
	nextjs: siNextdotjs,
	"next-js": siNextdotjs,
	vue: siVuedotjs,
	vuejs: siVuedotjs,
	nuxt: siNuxt,
	nuxtjs: siNuxt,
	svelte: siSvelte,
	angular: siAngular,
	astro: siAstro,
	vite: siVite,
	tailwind: siTailwindcss,
	tailwindcss: siTailwindcss,
	node: siNodedotjs,
	nodejs: siNodedotjs,
	express: siExpress,
	nest: siNestjs,
	nestjs: siNestjs,
	graphql: siGraphql,

	// BACKEND
	go: siGo,
	golang: siGo,
	fastapi: siFastapi,
	spring: siSpring,
	php: siPhp,
	laravel: siLaravel,
	ruby: siRuby,
	rust: siRust,
	kotlin: siKotlin,
	swift: siSwift,
	dart: siDart,
	flutter: siFlutter,
	elixir: siElixir,
	erlang: siErlang,
	clojure: siClojure,
	haskell: siHaskell,
	ocaml: siOcaml,
	perl: siPerl,
	lua: siLua,
	scala: siScala,
	crystal: siCrystal,
	fortran: siFortran,
	zig: siZig,
	vlang: siV,
	v: siV,

	// SYSTEM
    c: siCplusplus,
	cpp: siCplusplus,
	"c++": siCplusplus,
	cs: siDotnet,
	csharp: siDotnet,
	"c#": siDotnet,
	bash: siGnubash,
	shell: siGnubash,
	sh: siGnubash,
	powershell: siDotnet,

	// DEVOPS
	docker: siDocker,
	git: siGit,
	github: siGithub,
	vercel: siVercel,
	appwrite: siAppwrite,

	// DATABASE
    mysql: siMysql,
	postgres: siPostgresql,
	postgresql: siPostgresql,
	mongodb: siMongodb,
	redis: siRedis,
	prisma: siPrisma,

	// AI / ML
	tensorflow: siTensorflow,
	pytorch: siPytorch,
	android: siAndroid, // MOBILE

	// NOTEBOOKS / CONFIG
	"jupyter-notebook": siJupyter,
	jupyter: siJupyter,
	ipynb: siJupyter,
	yaml: siYaml,
	yml: siYaml,

	// TESTING
	vitest: siVitest,
	solidity: siSolidity,

	// TOOLS
	vim: siVim,
	bun: siBun,
};


function StatPill({
	icon,
	value,
}: {
	icon: React.ReactNode;
	value: string;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px]">
			{icon}
			{value}
		</span>
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

function formatCompactNumber(value: number) {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function normalizeIconKey(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[\s_+.]/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}