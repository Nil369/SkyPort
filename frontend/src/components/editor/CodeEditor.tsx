import * as React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import type { Extension } from "@codemirror/state";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  className?: string;
  height?: string;
};

export function CodeEditor({
  value,
  onChange,
  language,
  className,
  height = "100%",
}: Props) {
  const { effectiveTheme } = useTheme();
  const extensions = React.useMemo<Extension[]>(() => {
    const lang = (language ?? "").toLowerCase();
    if (["ts", "tsx", "js", "jsx", "typescript", "javascript"].includes(lang)) return [javascript({ jsx: true, typescript: true })];
    if (["json"].includes(lang)) return [json()];
    if (["md", "markdown"].includes(lang)) return [markdown()];
    if (["py", "python"].includes(lang)) return [python()];
    if (["css", "scss"].includes(lang)) return [css()];
    if (["html", "htm"].includes(lang)) return [html()];
    if (["yml", "yaml"].includes(lang)) return [yaml()];
    if (["sql"].includes(lang)) return [sql()];
    if (["xml", "svg"].includes(lang)) return [xml()];
    if (["shell", "sh", "bash", "zsh", "fish", "powershell", "ps1", "gitignore", "ignore", "text", "plaintext", "plain"].includes(lang)) return [];
    return [];
  }, [language]);

  return (
    <div className={cn("h-full w-full overflow-hidden", className)}>
      <CodeMirror
        value={value}
        height={height}
        theme={effectiveTheme === "dark" ? githubDark : githubLight}
        className="h-full text-[13px]"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          bracketMatching: true,
          autocompletion: true,
          closeBrackets: true,
          indentOnInput: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
        }}
        indentWithTab
        extensions={extensions}
        onChange={(val) => onChange(val)}
      />
    </div>
  );
}
