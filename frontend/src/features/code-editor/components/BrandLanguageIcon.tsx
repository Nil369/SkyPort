import * as React from "react";
import { Code2 } from "lucide-react";
import StackIcon from "tech-stack-icons";
import * as simpleIcons from "simple-icons";
import type { SimpleIcon } from "simple-icons";

const SIMPLE_ICON_ALIASES: Record<string, string[]> = {
  asn1: ["asn1", "asciidoctor"],
  apache: ["apache"],
  apple: ["apple"],
  antlr: ["antlr"],
  c: ["cplusplus", "cpp"],
  cc: ["cplusplus", "cpp"],
  cpp: ["cplusplus", "cpp"],
  cxx: ["cplusplus", "cpp"],
  cs: ["csharp"],
  csharp: ["csharp"],
  dockerfile: ["docker"],
  gnu: ["gnubash", "bash"],
  go: ["go"],
  google: ["google"],
  h: ["cplusplus", "cpp"],
  hh: ["cplusplus", "cpp"],
  hpp: ["cplusplus", "cpp"],
  hxx: ["cplusplus", "cpp"],
  html: ["html5"],
  javascript: ["javascript"],
  js: ["javascript"],
  jsx: ["react"],
  kotlin: ["kotlin"],
  kt: ["kotlin"],
  kdb: ["kx"],
  md: ["markdown"],
  markdown: ["markdown"],
  neo4j: ["neo4j"],
  php: ["php"],
  react: ["react"],
  rust: ["rust"],
  rs: ["rust"],
  scala: ["scala"],
  settings: ["gear"],
  sqlite: ["sql", "sqlite"],
  sql: ["sql", "sqlite"],
  text: ["text"],
  ts: ["typescript"],
  tsx: ["react"],
  typescript: ["typescript"],
  visualstudio: ["visualstudio"],
  vue: ["vuedotjs"],
  webassembly: ["webassembly"],
  webcomponentsdotorg: ["webcomponents"],
  xml: ["xml"],
  yaml: ["yaml"],
  yml: ["yaml"],
  zsh: ["gnubash", "bash"],
  groovy: ["apachegroovy"],
};

const SIMPLE_ICON_INDEX = simpleIcons as Record<
  string,
  SimpleIcon | undefined
>;

function toSimpleIconVariableName(slug: string): string {
  if (!slug) return "";

  return `si${slug[0].toUpperCase()}${slug.slice(1)}`;
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

function findSimpleIcon(iconSlug: string): SimpleIcon | null {
  const normalized = normalizeIconKey(iconSlug);

  if (!normalized) return null;

  const candidates = new Set<string>([
    normalized,
    normalized.replace(/\./g, "dot"),
    normalized.replace(/[^a-z0-9]/g, ""),
    ...(SIMPLE_ICON_ALIASES[normalized] ?? []),
  ]);

  for (const candidate of candidates) {
    const icon =
      SIMPLE_ICON_INDEX[
        toSimpleIconVariableName(candidate)
      ];

    if (icon) {
      return icon;
    }
  }

  return null;
}

/**
 * SECOND FALLBACK -> WEB ICON URLS
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
 * THIRD FALLBACK -> TECH STACK ICONS
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
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  php: "php",
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
  java: "java",
  css3: "css3",
  json: "json",
};

type ResolvedIcon =
  | {
      kind: "simple";
      icon: SimpleIcon;
    }
  | {
      kind: "url";
      src: string;
    }
  | {
      kind: "stack";
      name: string;
    }
  | {
      kind: "fallback";
    };

function resolveIcon(
  iconSlug: string,
): ResolvedIcon {
  const normalized = normalizeIconKey(iconSlug);

  /**
   * FORCE TECH STACK ICONS
   */
  if (
    normalized === "python" ||
    normalized === "py" ||
    normalized === "java"
  ) {
    const stackIcon =
      TECH_STACK_ICON_MAP[normalized];

    if (stackIcon) {
      return {
        kind: "stack",
        name: stackIcon,
      };
    }
  }

  /**
   * 1. SIMPLE ICONS
   */
  const simpleIcon = findSimpleIcon(normalized);

  if (simpleIcon) {
    return {
      kind: "simple",
      icon: simpleIcon,
    };
  }

  /**
   * 2. WEB ICONS
   */
  const webIcon = WEB_ICON_MAP[normalized];

  if (webIcon) {
    return {
      kind: "url",
      src: webIcon,
    };
  }

  /**
   * 3. TECH STACK ICONS
   */
  const stackIcon = TECH_STACK_ICON_MAP[normalized];

  if (stackIcon) {
    return {
      kind: "stack",
      name: stackIcon,
    };
  }

  /**
   * FINAL FALLBACK
   */
  return {
    kind: "fallback",
  };
}

export function getLanguageBrandColor(
  iconSlug: string,
): string {
  const resolved = resolveIcon(iconSlug);

  if (resolved.kind === "simple") {
    return resolved.icon.hex
      ? `#${resolved.icon.hex}`
      : "#6B7280";
  }

  return "#6B7280";
}

interface BrandLanguageIconProps {
  iconSlug: string;
  className?: string;
  title?: string;
}

export function BrandLanguageIcon({
  iconSlug,
  className,
  title,
}: BrandLanguageIconProps) {
  const resolved = React.useMemo(
    () => resolveIcon(iconSlug),
    [iconSlug],
  );

  /**
   * SIMPLE ICON
   */
  if (resolved.kind === "simple") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
      >
        <path
          fill={`#${resolved.icon.hex}`}
          d={resolved.icon.path}
        />
      </svg>
    );
  }

  /**
   * WEB URL ICON
   */
  if (resolved.kind === "url") {
    return (
      <img
        src={resolved.src}
        alt={title || iconSlug}
        className={className}
        loading="lazy"
        draggable={false}
      />
    );
  }

  /**
   * TECH STACK ICON
   */
  if (resolved.kind === "stack") {
    return (
      <StackIcon
        name={resolved.name as any}
        className={className}
      />
    );
  }

  /**
   * FINAL FALLBACK
   */
  return (
    <Code2
      className={className}
      aria-hidden
    />
  );
}