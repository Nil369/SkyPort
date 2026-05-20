import * as React from "react";
import { faFileAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import StackIcon from "tech-stack-icons";
import * as simpleIcons from "simple-icons";

export type IconSource = "local" | "secondary" | "remote" | "generic";

export type ResolvedIcon = {
	icon: React.ReactNode;
	color: string;
	source: IconSource;
};

const ICON_CACHE = new Map<string, ResolvedIcon>();

const SIMPLE_ICON_MAP: Record<string, string> = {
	js: "siJavascript",
	jsx: "siReact",
	ts: "siTypescript",
	tsx: "siReact",
	py: "siPython",
	go: "siGo",
	php: "siPhp",
	java: "siOpenjdk",
	json: "siJson",
	md: "siMarkdown",
	css: "siCss3",
	html: "siHtml5",
	yaml: "siYaml",
	yml: "siYaml",
	svg: "siSvg",
	dockerfile: "siDocker",
	gitignore: "siGit",
	lock: "siLock",
	sh: "siGnubash",
	bash: "siGnubash",
	zsh: "siGnubash",
	ps1: "siPowershell",
	vue: "siVuedotjs",
	next: "siNextdotjs",
	node: "siNodedotjs",
	vite: "siVite",
	react: "siReact",
	bun: "siBun",
	deno: "siDeno",
	python: "siPython",
	go_mod: "siGo",
};

const SECONDARY_ICON_MAP: Record<string, string> = {
	next: "nextjs",
	react: "react",
	vite: "vite",
	vue: "vue",
	node: "nodejs",
	bun: "bun",
	python: "python",
	go: "go",
	java: "java",
	php: "php",
	docker: "docker",
	git: "git",
	redis: "redis",
	postgres: "postgresql",
	mysql: "mysql",
	graphql: "graphql",
};

const REMOTE_ICON_MAP: Record<string, string> = {
	next: "nextdotjs",
	react: "react",
	vite: "vite",
	vue: "vuedotjs",
	node: "nodedotjs",
	bun: "bun",
	python: "python",
	go: "go",
	java: "openjdk",
	php: "php",
	docker: "docker",
	git: "git",
};

export function resolveIcon(filename: string): ResolvedIcon {
	const key = normalizeKey(filename);
	const cached = ICON_CACHE.get(key);
	if (cached) return cached;

	const local = resolveLocalIcon(key);
	if (local) {
		ICON_CACHE.set(key, local);
		return local;
	}

	const secondary = resolveSecondaryIcon(key);
	if (secondary) {
		ICON_CACHE.set(key, secondary);
		return secondary;
	}

	const remote = resolveRemoteIcon(key);
	if (remote) {
		ICON_CACHE.set(key, remote);
		return remote;
	}

	const generic: ResolvedIcon = {
		icon: <FontAwesomeIcon icon={faFileAlt} className="size-4 shrink-0" />,
		color: "#6b7280",
		source: "generic",
	};
	ICON_CACHE.set(key, generic);
	return generic;
}

function resolveLocalIcon(key: string): ResolvedIcon | null {
	const symbol = SIMPLE_ICON_MAP[key];
	if (!symbol) return null;
	const iconData = (simpleIcons as any)[symbol];
	if (!iconData) return null;
	return {
		icon: (
			<svg role="img" viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
				<path d={iconData.path} />
			</svg>
		),
		color: `#${iconData.hex}`,
		source: "local",
	};
}

function resolveSecondaryIcon(key: string): ResolvedIcon | null {
	const name = SECONDARY_ICON_MAP[key];
	if (!name) return null;
	return {
		icon: <StackIcon name={name as any} variant="dark" className="size-4 shrink-0" />,
		color: "currentColor",
		source: "secondary",
	};
}

function resolveRemoteIcon(key: string): ResolvedIcon | null {
	const slug = REMOTE_ICON_MAP[key];
	if (!slug) return null;
	const src = `https://cdn.simpleicons.org/${slug}/9ca3af`;
	return {
		icon: <img src={src} alt="" loading="lazy" className="size-4 shrink-0" />,
		color: "#9ca3af",
		source: "remote",
	};
}

function normalizeKey(filename: string) {
	const lower = filename.toLowerCase();
	if (lower === "dockerfile") return "dockerfile";
	if (lower === ".gitignore") return "gitignore";
	if (lower === ".gitattributes") return "gitignore";
	if (lower.endsWith("go.mod")) return "go_mod";
	const ext = lower.split(".").pop() ?? lower;
	return ext;
}
