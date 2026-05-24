import * as React from "react";
import { faFileAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
	BrandLanguageIcon,
	getLanguageBrandColor,
} from "@/features/code-editor/components/BrandLanguageIcon";
import StackIcon from "tech-stack-icons";

export type IconSource =
	| "simple"
	| "web"
	| "stack"
	| "generic";

export type ResolvedIcon = {
	icon: React.ReactNode;
	color: string;
	source: IconSource;
};


/**
 * SIMPLE ICONS
 */
const SIMPLE_ICON_MAP: Record<string, string> = {
	js: "javascript",
	jsx: "react",
	ts: "typescript",
	tsx: "react",
	go: "go",
	php: "php",
	kt: "kotlin",
	kotlin: "kotlin",
	rs: "rust",
	rust: "rust",
	scala: "scala",
	swift: "swift",
	c: "cplusplus",
	cc: "cplusplus",
	cpp: "cplusplus",
	cxx: "cplusplus",
	cs: "csharp",
	csharp: "csharp",
	h: "cplusplus",
	hh: "cplusplus",
	hpp: "cplusplus",
	hxx: "cplusplus",
	md: "markdown",
	markdown: "markdown",
	css: "css3",
	html: "html5",
	htm: "html5",
	yaml: "yaml",
	yml: "yaml",
	xml: "xml",
	svg: "svg",
	dockerfile: "docker",
	gitignore: "git",
	gitattributes: "git",
	lock: "lock",
	sh: "gnubash",
	bash: "gnubash",
	zsh: "gnubash",
	ps1: "powershell",
	vue: "vuedotjs",
	next: "nextdotjs",
	node: "nodedotjs",
	vite: "vite",
	react: "react",
	bun: "bun",
	deno: "deno",
	mjs: "javascript",
	cjs: "javascript",
	groovy: "apachegroovy"
};

/**
 * WEB ICONS
 */
const WEB_ICON_MAP: Record<string, string> = {
  powershell: "https://cdn.iconscout.com/icon/free/png-256/free-powershell-logo-icon-svg-download-png-2945093.png?f=webp",
  apl: "https://upload.wikimedia.org/wikipedia/commons/b/b6/APL_%28programming_language%29_logo.svg",
  brainfuck: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Brainfuck-mw-logo.png",
  cobol: "https://www.svgrepo.com/show/373510/cobol.svg",
  handlebars: "https://cdn.worldvectorlogo.com/logos/handlebars.svg",
  http: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/HTTP_logo.svg/3840px-HTTP_logo.svg.png",
  pascal: "https://cryptologos.cc/logos/pascal-pasc-logo.png",
  sas: "https://images.icon-icons.com/2699/PNG/512/sas_logo_icon_170761.png",
  w3c: "https://images.icon-icons.com/844/PNG/512/W3C_icon-icons.com_67053.png",
  vhdl: "https://www.svgrepo.com/show/374164/vhdl.svg",
  verilog: "https://www.svgrepo.com/show/374163/verilog.svg",
  text: "https://cdn-icons-png.flaticon.com/512/10435/10435080.png",
  antlr: "https://images.icon-icons.com/2107/PNG/512/file_type_antlr_icon_130752.png",
  octave: "https://www.svgrepo.com/show/373830/matlab.svg",
  mathworks: "https://www.svgrepo.com/show/373830/matlab.svg",
  json: "https://images.icon-icons.com/2107/PNG/512/file_type_light_json_icon_130455.png",
  settings:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Windows_Settings_icon.svg/3840px-Windows_Settings_icon.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail",
  windows: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Windows_logo_-_2021.svg/3840px-Windows_logo_-_2021.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail",
  tcl: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Logo_of_the_TCL_Corporation.svg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
  visualstudio: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Visual_Studio_Icon_2019.svg/960px-Visual_Studio_Icon_2019.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail&_=20210214224138",
};

/**
 * TECH STACK ICONS
 */
const TECH_STACK_ICON_MAP: Record<string, string> = {
	postgresql: "postgresql",
	postgres: "postgresql",
	mysql: "mysql",
	mariadb: "mariadb",
	mongodb: "mongodb",
	redis: "redis",
	node: "nodejs2",
	nodejs: "nodejs2",
	bun: "bunjs",
	go: "go",
	golang: "go",
	php: "php",
	java: "java",
	react: "react",
	vue: "vuejs",
	vuejs: "vuejs",
	docker: "docker",
	grafana: "grafana",
	prometheus: "prometheus",
	nginx: "nginx",
	rust: "rust",
	angular: "angular",
	kubernetes: "kubernetes",
	terraform: "terraform",
	github: "github",
	gitlab: "gitlab",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	python: "python",
	json: "json",
};

export function resolveIcon(
	filename: string,
): ResolvedIcon {
	const key = normalizeKey(filename);

	/**
	 * 1. SIMPLE ICONS
	 */
	const simpleSlug = SIMPLE_ICON_MAP[key];

	if (simpleSlug) {
		const resolved: ResolvedIcon = {
			icon: (
				<BrandLanguageIcon
					iconSlug={simpleSlug}
					className="size-4 shrink-0"
					title={key}
				/>
			),
			color: getLanguageBrandColor(simpleSlug),
			source: "simple",
		};


		return resolved;
	}

	/**
	 * 2. WEB ICONS
	 */
	const webIcon = WEB_ICON_MAP[key];

	if (webIcon) {
		const resolved: ResolvedIcon = {
			icon: (
				<img
					src={webIcon}
					alt={key}
					className="size-4 shrink-0"
					loading="lazy"
					draggable={false}
				/>
			),
			color: "#6B7280",
			source: "web",
		};

		return resolved;
	}

	/**
	 * 3. TECH STACK ICONS
	 */
	const stackIcon = TECH_STACK_ICON_MAP[key];

	if (stackIcon) {
		const resolved: ResolvedIcon = {
			icon: (
				<StackIcon
					name={stackIcon as any}
					className="size-4 shrink-0"
				/>
			),
			color: getLanguageBrandColor(stackIcon),
			source: "stack",
		};

		return resolved;
	}

	/**
	 * FINAL FALLBACK
	 */
	const generic: ResolvedIcon = {
		icon: (
			<FontAwesomeIcon
				icon={faFileAlt}
				className="size-4 shrink-0"
			/>
		),
		color: "#6b7280",
		source: "generic",
	};

	return generic;
}

function normalizeKey(filename: string) {
	const lower = filename.toLowerCase();

	if (lower === "dockerfile") {
		return "dockerfile";
	}

	if (lower === ".gitignore") {
		return "gitignore";
	}

	if (lower === ".gitattributes") {
		return "gitattributes";
	}

	if (lower.endsWith("go.mod")) {
		return "go_mod";
	}

	const ext = lower.split(".").pop() ?? lower;

	return ext;
}