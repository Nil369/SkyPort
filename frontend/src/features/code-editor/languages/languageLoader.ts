import type { Extension } from "@codemirror/state";
import { LanguageDescription } from "@codemirror/language";
import { languages as bundledLanguages } from "@codemirror/language-data";

import type { LanguageDefinition } from "@/features/code-editor/languages/languageRegistry";

const EXTENSION_CACHE = new Map<string, Promise<Extension[]>>();

const LANGUAGE_NAME_HINTS: Record<string, string[]> = {
  "apl": ["apl"],
  "asn.1": ["asn.1", "asn1"],
  "asterisk": ["asterisk"],
  "brainfuck": ["brainfuck"],
  "clike": ["c", "c++", "c#", "kotlin", "scala"],
  "clojure": ["clojure"],
  "cmake": ["cmake"],
  "cobol": ["cobol"],
  "coffeescript": ["coffeescript"],
  "crystal": ["crystal"],
  "css": ["css", "sass", "less"],
  "cypher": ["cypher"],
  "d": ["d"],
  "dart": ["dart"],
  "django": ["django", "html"],
  "dockerfile": ["dockerfile"],
  "diff": ["diff"],
  "elixir": ["elixir"],
  "elm": ["elm"],
  "erlang": ["erlang"],
  "fortran": ["fortran"],
  "fsharp": ["f#"],
  "gherkin": ["gherkin"],
  "go": ["go"],
  "groovy": ["groovy"],
  "handlebars": ["handlebars"],
  "haskell": ["haskell"],
  "haxe": ["haxe"],
  "htmlmixed": ["html"],
  "http": ["http"],
  "java": ["java"],
  "javascript": ["javascript", "jsx"],
  "julia": ["julia"],
  "kotlin": ["kotlin"],
  "less": ["less"],
  "lua": ["lua"],
  "markdown": ["markdown"],
  "json": ["json"],
  "mathematica": ["mathematica", "wolfram"],
  "nginx": ["nginx"],
  "nsis": ["nsis"],
  "objectivec": ["objective-c"],
  "ocaml": ["ocaml"],
  "octave": ["octave", "matlab"],
  "pascal": ["pascal"],
  "perl": ["perl"],
  "php": ["php"],
  "powershell": ["powershell"],
  "protobuf": ["protobuf"],
  "pug": ["pug"],
  "puppet": ["puppet"],
  "python": ["python"],
  "q": ["q"],
  "r": ["r"],
  "ruby": ["ruby"],
  "rust": ["rust"],
  "sas": ["sas"],
  "sass": ["sass", "scss"],
  "scala": ["scala"],
  "scheme": ["scheme"],
  "shell": ["shell", "bash", "sh"],
  "slim": ["slim"],
  "solr": ["solr"],
  "stylus": ["stylus"],
  "sql": ["sql"],
  "swift": ["swift"],
  "stex": ["latex"],
  "tcl": ["tcl"],
  "toml": ["toml"],
  "twig": ["twig"],
  "vbnet": ["vb"],
  "vbscript": ["vbscript"],
  "verilog": ["verilog"],
  "vhdl": ["vhdl"],
  "vue": ["vue"],
  "wasm": ["wast", "webassembly"],
  "xml": ["xml"],
  "xquery": ["xquery"],
  "yaml": ["yaml"],
  "typescript": ["typescript", "tsx"],
  "tsx": ["tsx", "typescript"],
  "jsx": ["jsx", "javascript"],
  "dockercompose": ["yaml"],
  "dotenv": ["properties"],
  "text": ["text"],
  "mjs": ["javascript"],
  "cjs": ["javascript"],
};

function findLanguageDescription(language: LanguageDefinition): LanguageDescription | null {
  const hints = LANGUAGE_NAME_HINTS[language.id] ?? [];
  const normalizedHints = hints.map((hint) => hint.toLowerCase());

  for (const description of bundledLanguages) {
    const name = description.name.toLowerCase();
    if (normalizedHints.some((hint) => name === hint || name.includes(hint))) {
      return description;
    }

    if (description.alias && description.alias.some((alias) => normalizedHints.includes(alias.toLowerCase()))) {
      return description;
    }
  }

  for (const token of language.extensions) {
    const matchFileName = token.startsWith(".") ? `index${token}` : token;
    const description = LanguageDescription.matchFilename(bundledLanguages, matchFileName);
    if (description) {
      return description;
    }
  }

  return null;
}

async function loadLanguage(language: LanguageDefinition): Promise<Extension[]> {
  const description = findLanguageDescription(language);
  if (!description) {
    return [];
  }

  try {
    const support = await description.load();
    return [support];
  } catch {
    return [];
  }
}

export async function getLanguageExtensions(language: LanguageDefinition): Promise<Extension[]> {
  const cacheKey = language.id;
  if (!EXTENSION_CACHE.has(cacheKey)) {
    EXTENSION_CACHE.set(cacheKey, loadLanguage(language));
  }

  return EXTENSION_CACHE.get(cacheKey) ?? Promise.resolve([]);
}
