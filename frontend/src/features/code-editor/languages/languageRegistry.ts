export interface LanguageDefinition {
  id: string;
  label: string;
  iconSlug: string;
  extensions: string[];
}

export const LANGUAGE_REGISTRY: readonly LanguageDefinition[] = Object.freeze([
  { id: "apl", label: "APL", iconSlug: "apl", extensions: [".apl"] },
  { id: "asn.1", label: "ASN.1", iconSlug: "asn1", extensions: [".asn"] },
  { id: "asterisk", label: "Asterisk", iconSlug: "asterisk", extensions: [".conf"] },
  { id: "brainfuck", label: "Brainfuck", iconSlug: "brainfuck", extensions: [".bf"] },
  { id: "clike", label: "C / C++ / C#", iconSlug: "cplusplus", extensions: [".c", ".cpp", ".cs"] },
  { id: "clojure", label: "Clojure", iconSlug: "clojure", extensions: [".clj"] },
  { id: "cmake", label: "CMake", iconSlug: "cmake", extensions: ["CMakeLists.txt", ".cmake"] },
  { id: "cobol", label: "COBOL", iconSlug: "cobol", extensions: [".cbl"] },
  { id: "coffeescript", label: "CoffeeScript", iconSlug: "coffeescript", extensions: [".coffee"] },
  { id: "crystal", label: "Crystal", iconSlug: "crystal", extensions: [".cr"] },
  { id: "css", label: "CSS", iconSlug: "css3", extensions: [".css"] },
  { id: "cypher", label: "Cypher", iconSlug: "neo4j", extensions: [".cypher"] },
  { id: "d", label: "D", iconSlug: "d", extensions: [".d"] },
  { id: "dart", label: "Dart", iconSlug: "dart", extensions: [".dart"] },
  { id: "django", label: "Django", iconSlug: "django", extensions: [".html"] },
  { id: "dockerfile", label: "Dockerfile", iconSlug: "docker", extensions: ["Dockerfile"] },
  { id: "diff", label: "Diff", iconSlug: "git", extensions: [".diff", ".patch"] },
  { id: "elixir", label: "Elixir", iconSlug: "elixir", extensions: [".ex", ".exs"] },
  { id: "elm", label: "Elm", iconSlug: "elm", extensions: [".elm"] },
  { id: "erlang", label: "Erlang", iconSlug: "erlang", extensions: [".erl"] },
  { id: "fortran", label: "Fortran", iconSlug: "fortran", extensions: [".f", ".for"] },
  { id: "fsharp", label: "F#", iconSlug: "fsharp", extensions: [".fs"] },
  { id: "gherkin", label: "Gherkin", iconSlug: "cucumber", extensions: [".feature"] },
  { id: "go", label: "Go", iconSlug: "go", extensions: [".go"] },
  { id: "groovy", label: "Groovy", iconSlug: "groovy", extensions: [".groovy"] },
  { id: "handlebars", label: "Handlebars", iconSlug: "handlebars", extensions: [".hbs"] },
  { id: "haskell", label: "Haskell", iconSlug: "haskell", extensions: [".hs"] },
  { id: "haxe", label: "Haxe", iconSlug: "haxe", extensions: [".hx"] },
  { id: "htmlmixed", label: "HTML", iconSlug: "html5", extensions: [".html", ".htm"] },
  { id: "http", label: "HTTP", iconSlug: "http", extensions: [".http"] },
  { id: "java", label: "Java", iconSlug: "java", extensions: [".java"] },
  { id: "javascript", label: "JavaScript / JSX", iconSlug: "javascript", extensions: [".js", ".jsx"] },
  { id: "json", label: "JSON", iconSlug: "json", extensions: [".json"] },
  { id: "julia", label: "Julia", iconSlug: "julia", extensions: [".jl"] },
  { id: "kotlin", label: "Kotlin", iconSlug: "kotlin", extensions: [".kt"] },
  { id: "less", label: "LESS", iconSlug: "less", extensions: [".less"] },
  { id: "lua", label: "Lua", iconSlug: "lua", extensions: [".lua"] },
  { id: "markdown", label: "Markdown", iconSlug: "markdown", extensions: [".md", ".markdown"] },
  { id: "mathematica", label: "Mathematica", iconSlug: "wolfram", extensions: [".nb"] },
  { id: "nginx", label: "Nginx", iconSlug: "nginx", extensions: [".conf"] },
  { id: "nsis", label: "NSIS", iconSlug: "nsis", extensions: [".nsi"] },
  { id: "objectivec", label: "Objective C", iconSlug: "apple", extensions: [".m"] },
  { id: "ocaml", label: "OCaml", iconSlug: "ocaml", extensions: [".ml"] },
  { id: "octave", label: "Octave / MATLAB", iconSlug: "octave", extensions: [".m"] },
  { id: "pascal", label: "Pascal", iconSlug: "pascal", extensions: [".pas"] },
  { id: "perl", label: "Perl", iconSlug: "perl", extensions: [".pl"] },
  { id: "php", label: "PHP", iconSlug: "php", extensions: [".php"] },
  { id: "powershell", label: "PowerShell", iconSlug: "powershell", extensions: [".ps1"] },
  { id: "protobuf", label: "ProtoBuf", iconSlug: "google", extensions: [".proto"] },
  { id: "pug", label: "Pug", iconSlug: "pug", extensions: [".pug"] },
  { id: "puppet", label: "Puppet", iconSlug: "puppet", extensions: [".pp"] },
  { id: "python", label: "Python", iconSlug: "python", extensions: [".py"] },
  { id: "q", label: "Q", iconSlug: "kdb", extensions: [".q"] },
  { id: "r", label: "R", iconSlug: "r", extensions: [".r"] },
  { id: "ruby", label: "Ruby", iconSlug: "ruby", extensions: [".rb"] },
  { id: "rust", label: "Rust", iconSlug: "rust", extensions: [".rs"] },
  { id: "sas", label: "SAS", iconSlug: "sas", extensions: [".sas"] },
  { id: "sass", label: "Sass / SCSS", iconSlug: "sass", extensions: [".sass", ".scss"] },
  { id: "scala", label: "Scala", iconSlug: "scala", extensions: [".scala"] },
  { id: "shell", label: "Shell / Bash", iconSlug: "gnu", extensions: [".sh", ".bash"] },
  { id: "solr", label: "Solr", iconSlug: "apache", extensions: [".solr"] },
  { id: "stylus", label: "Stylus", iconSlug: "stylus", extensions: [".styl"] },
  { id: "sql", label: "SQL", iconSlug: "sqlite", extensions: [".sql"] },
  { id: "swift", label: "Swift", iconSlug: "swift", extensions: [".swift"] },
  { id: "stex", label: "LaTeX", iconSlug: "latex", extensions: [".tex"] },
  { id: "tcl", label: "Tcl", iconSlug: "tcl", extensions: [".tcl"] },
  { id: "toml", label: "TOML", iconSlug: "toml", extensions: [".toml"] },
  { id: "twig", label: "Twig", iconSlug: "symfony", extensions: [".twig"] },
  { id: "vbnet", label: "VB.NET", iconSlug: "visualstudio", extensions: [".vb"] },
  { id: "vbscript", label: "VBScript", iconSlug: "visualstudio", extensions: [".vbs"] },
  { id: "verilog", label: "Verilog", iconSlug: "verilog", extensions: [".v"] },
  { id: "vhdl", label: "VHDL", iconSlug: "vhdl", extensions: [".vhd"] },
  { id: "vue", label: "Vue.js", iconSlug: "vuedotjs", extensions: [".vue"] },
  { id: "wasm", label: "WebAssembly", iconSlug: "webassembly", extensions: [".wasm", ".wat"] },
  { id: "xml", label: "XML / HTML", iconSlug: "xml", extensions: [".xml"] },
  { id: "xquery", label: "XQuery", iconSlug: "xml", extensions: [".xq"] },
  { id: "yaml", label: "YAML", iconSlug: "yaml", extensions: [".yaml", ".yml"] },

  { id: "ada", label: "Ada", iconSlug: "ada", extensions: [".adb", ".ads"] },
  { id: "awk", label: "AWK", iconSlug: "gnu", extensions: [".awk"] },
  { id: "batch", label: "Batch", iconSlug: "windows", extensions: [".bat", ".cmd"] },
  { id: "commonlisp", label: "Common Lisp", iconSlug: "commonlisp", extensions: [".lisp", ".lsp"] },
  { id: "csv", label: "CSV", iconSlug: "comma", extensions: [".csv"] },
  { id: "dtd", label: "DTD", iconSlug: "xml", extensions: [".dtd"] },
  { id: "ebnf", label: "EBNF", iconSlug: "antlr", extensions: [".ebnf"] },
  { id: "gss", label: "GSS", iconSlug: "google", extensions: [".gss"] },
  { id: "ini", label: "INI", iconSlug: "settings", extensions: [".ini"] },
  { id: "jinja2", label: "Jinja2", iconSlug: "jinja", extensions: [".j2"] },
  { id: "jsx", label: "JSX", iconSlug: "react", extensions: [".jsx"] },
  { id: "livescript", label: "LiveScript", iconSlug: "javascript", extensions: [".ls"] },
  { id: "matlab", label: "MATLAB", iconSlug: "mathworks", extensions: [".m"] },
  { id: "nginxconf", label: "Nginx Config", iconSlug: "nginx", extensions: ["nginx.conf"] },
  { id: "properties", label: "Properties", iconSlug: "openjdk", extensions: [".properties"] },
  { id: "raku", label: "Raku", iconSlug: "perl", extensions: [".raku"] },
  { id: "restructuredtext", label: "reStructuredText", iconSlug: "rstudioide", extensions: [".rst"] },
  { id: "sparql", label: "SPARQL", iconSlug: "wikidata", extensions: [".rq"] },
  { id: "svelte", label: "Svelte", iconSlug: "svelte", extensions: [".svelte"] },
  { id: "tsx", label: "TSX", iconSlug: "tsx", extensions: [".tsx"] },
  { id: "ttl", label: "Turtle", iconSlug: "w3c", extensions: [".ttl"] },
  { id: "typescript", label: "TypeScript", iconSlug: "typescript", extensions: [".ts"] },
  { id: "webidl", label: "WebIDL", iconSlug: "webcomponentsdotorg", extensions: [".webidl"] },
  { id: "zig", label: "Zig", iconSlug: "zig", extensions: [".zig"] },
  { id: "dockercompose", label: "Docker Compose", iconSlug: "docker", extensions: ["docker-compose.yml", "compose.yml"] },
  { id: "makefile", label: "Makefile", iconSlug: "gnubash", extensions: ["Makefile", ".mk"] },
  { id: "graphql", label: "GraphQL", iconSlug: "graphql", extensions: [".graphql", ".gql"] },
  { id: "kubernetes", label: "Kubernetes", iconSlug: "kubernetes", extensions: [".k8s.yaml"] },
  { id: "helm", label: "Helm", iconSlug: "helm", extensions: ["Chart.yaml"] },
  { id: "dotenv", label: "Dotenv", iconSlug: "dotenv", extensions: [".env"] },
  { id: "text", label: "Plain Text", iconSlug: "text", extensions: [".txt"] },
  { id: "mjs", label: "JavaScript (ESM)", iconSlug: "javascript", extensions: [".mjs"] },
  { id: "cjs", label: "JavaScript (CJS)", iconSlug: "javascript", extensions: [".cjs"] },
] as const);

export const DEFAULT_LANGUAGE: LanguageDefinition = Object.freeze({
  id: "text",
  label: "Plain Text",
  iconSlug: "text",
  extensions: [".txt"],
});

const EXACT_NAME_INDEX = new Map<string, LanguageDefinition>();
const EXTENSION_INDEX = new Map<string, LanguageDefinition>();
const ID_INDEX = new Map<string, LanguageDefinition>();

for (const lang of LANGUAGE_REGISTRY) {
  ID_INDEX.set(lang.id.toLowerCase(), lang);

  for (const ext of lang.extensions) {
    const normalized = ext.trim().toLowerCase();
    if (!normalized) continue;

    if (normalized.startsWith(".")) {
      if (!EXTENSION_INDEX.has(normalized)) {
        EXTENSION_INDEX.set(normalized, lang);
      }
    } else if (!EXACT_NAME_INDEX.has(normalized)) {
      EXACT_NAME_INDEX.set(normalized, lang);
    }
  }
}

export function getLanguageById(id: string | null | undefined): LanguageDefinition {
  if (!id) return DEFAULT_LANGUAGE;
  return ID_INDEX.get(id.toLowerCase()) ?? DEFAULT_LANGUAGE;
}

export function detectLanguageFromPath(path: string): LanguageDefinition {
  if (!path) return DEFAULT_LANGUAGE;

  const normalized = path.replace(/\\/g, "/");
  const fileName = (normalized.split("/").pop() ?? "").toLowerCase();

  const exact = EXACT_NAME_INDEX.get(fileName);
  if (exact) return exact;

  const dot = fileName.lastIndexOf(".");
  if (dot !== -1) {
    const ext = fileName.slice(dot);
    const match = EXTENSION_INDEX.get(ext);
    if (match) return match;
  }

  return DEFAULT_LANGUAGE;
}

export function getLanguageSearchText(language: LanguageDefinition): string {
  return `${language.label} ${language.id} ${language.iconSlug} ${language.extensions.join(" ")}`.toLowerCase();
}
