import * as React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { indentUnit } from '@codemirror/language';
import type { Extension } from "@codemirror/state";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { xcodeLight, xcodeDark } from "@uiw/codemirror-theme-xcode";
import { basicLight, basicDark } from "@uiw/codemirror-theme-basic";
import { materialLight, materialDark } from "@uiw/codemirror-theme-material"
import { sublime } from "@uiw/codemirror-theme-sublime";
import { monokai } from "@uiw/codemirror-theme-monokai";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { aura } from "@uiw/codemirror-theme-aura";
import { atomone } from "@uiw/codemirror-theme-atomone";
import { andromeda } from "@uiw/codemirror-theme-andromeda";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { bbedit } from "@uiw/codemirror-theme-bbedit";
import { eclipse } from "@uiw/codemirror-theme-eclipse";
import { noctisLilac } from "@uiw/codemirror-theme-noctis-lilac";
import { quietlight } from "@uiw/codemirror-theme-quietlight";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { getLanguageById } from "@/features/code-editor/languages/languageRegistry";
import { getLanguageExtensions } from "@/features/code-editor/languages/languageLoader";
import {
  CodeMirrorQuickAccessController,
  createCodeMirrorQuickAccessExtensions,
} from "@/components/editor/codemirrorQuickActions";
import { Check, Settings, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type Props = {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  className?: string;
  height?: string;
};

type EditorSettings = {
  fontSize: number;
  tabSize: number;
  lineHeight: number;
  wordWrap: boolean;
};

export function CodeEditor({
  value,
  onChange,
  language,
  className,
  height = "100%",
}: Props) {
  const { effectiveTheme } = useTheme();
  const languageDefinition = React.useMemo(() => getLanguageById(language), [language]);
  const [extensions, setExtensions] = React.useState<Extension[]>([]);
  const [showSettings, setShowSettings] = React.useState(false);
  const [themeCollapsed, setThemeCollapsed] = React.useState(false);
  const quickAccessControllerRef = React.useRef<CodeMirrorQuickAccessController | null>(null);

  const [settings, setSettings] = React.useState<EditorSettings>(() => {
    if (typeof window === "undefined") {
      return {
        fontSize: 14,
        tabSize: 4,
        lineHeight: 1.6,
        wordWrap: false,
      };
    }

    const saved = window.localStorage.getItem("editor-settings");
    return saved
      ? JSON.parse(saved)
      : {
          fontSize: 14,
          tabSize: 4,
          lineHeight: 1.6,
          wordWrap: false,
        };
  });

  React.useEffect(() => {
    window.localStorage.setItem("editor-settings", JSON.stringify(settings));
  }, [settings]);

  if (!quickAccessControllerRef.current) {
    quickAccessControllerRef.current = new CodeMirrorQuickAccessController();
  }

  const quickAccessController = quickAccessControllerRef.current;
  const quickAccessExtensions = React.useMemo(
    () => createCodeMirrorQuickAccessExtensions(quickAccessController),
    [quickAccessController]
  );

  type ThemeOption = {
    id: string;
    name: string;
    variant: "light" | "dark";
    version?: string;
    extension: Extension;
  };

  const themeOptions = React.useMemo<ThemeOption[]>(
    () => [
      { id: "github-dark", name: "GitHub Dark", variant: "dark", version: "^4.25.10", extension: githubDark },
      { id: "github-light", name: "GitHub Light", variant: "light", version: "^4.25.10", extension: githubLight },
      { id: "vscode-dark", name: "VSCode Dark", variant: "dark", version: "^4.25.10", extension: vscodeDark },
      { id: "vscode-light", name: "VSCode Light", variant: "light", version: "^4.25.10", extension: vscodeLight },
      { id: "xcode-light", name: "Xcode Light", variant: "light", version: "^4.25.10", extension: xcodeLight },
      { id: "xcode-dark", name: "Xcode Dark", variant: "dark", version: "^4.25.10", extension: xcodeDark },
      { id: "basic-light", name: "Basic Light", variant: "light", version: "^4.25.10", extension: basicLight },
      { id: "basic-dark", name: "Basic Dark", variant: "dark", version: "^4.25.10", extension: basicDark },
      { id: "material-light", name: "Material Light", variant: "light", version: "^4.25.10", extension: materialLight },
      { id: "material-dark", name: "Material Dark", variant: "dark", version: "^4.25.10", extension: materialDark },
      { id: "dracula", name: "Dracula", variant: "dark", version: "^4.25.10", extension: dracula },
      { id: "aura", name: "Aura", variant: "dark", version: "^4.25.10", extension: aura },
      { id: "atomone", name: "Atom One", variant: "dark", version: "^4.25.10", extension: atomone },
      { id: "sublime", name: "Sublime", variant: "dark", version: "^4.25.10", extension: sublime },
      { id: "monokai", name: "Monokai", variant: "dark", version: "^4.25.10", extension: monokai },
      { id: "andromeda", name: "Andromeda", variant: "dark", version: "^4.25.10", extension: andromeda },
      { id: "tokyo-night", name: "Tokyo Night", variant: "dark", version: "^4.25.10", extension: tokyoNight },
      { id: "bbedit", name: "BBEdit", variant: "light", version: "^4.25.10", extension: bbedit },
      { id: "eclipse", name: "Eclipse", variant: "light", version: "^4.25.10", extension: eclipse },
      { id: "noctis-lilac", name: "Noctis Lilac", variant: "light", version: "^4.25.10", extension: noctisLilac },
      { id: "quietlight", name: "Quietlight", variant: "light", version: "^4.25.10", extension: quietlight },
    ],
    []
  );

  const [themeId, setThemeId] = React.useState<string>(() => {
    if (typeof window === "undefined") {
      return effectiveTheme === "dark" ? "github-dark" : "github-light";
    }

    const savedThemeId = window.localStorage.getItem("codemirror-theme-id");
    return savedThemeId ?? (effectiveTheme === "dark" ? "github-dark" : "github-light");
  });

  React.useEffect(() => {
    let isDisposed = false;

    setExtensions([]);
    void getLanguageExtensions(languageDefinition).then((loaded) => {
      if (!isDisposed) {
        setExtensions(loaded);
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [languageDefinition.id]);

  React.useEffect(() => {
    return () => {
      quickAccessController.destroy();
    };
  }, [quickAccessController]);

  React.useEffect(() => {
    window.localStorage.setItem("codemirror-theme-id", themeId);
  }, [themeId]);

  const themeExtension = React.useMemo(() => {
    return themeOptions.find((theme) => theme.id === themeId)?.extension ?? (effectiveTheme === "dark" ? githubDark : githubLight);
  }, [effectiveTheme, themeId, themeOptions]);

  const lightThemes = themeOptions.filter((theme) => theme.variant === "light");
  const darkThemes = themeOptions.filter((theme) => theme.variant === "dark");

  const selectTheme = (id: string) => {
    setThemeId(id);
    window.localStorage.setItem("codemirror-theme-id", id);
  };

  return (
    <div className={cn("relative h-full min-h-0 w-full overflow-auto invisible-scroll", className)}>
      <div className="absolute right-2 top-2 z-20">
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 text-xs shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editor Settings</DialogTitle>
              <DialogDescription>Customize your editor preferences</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Font Size: {settings.fontSize}px</Label>
                <Slider
                  min={10}
                  max={24}
                  step={1}
                  value={[settings.fontSize]}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, fontSize: value[0] }))}
                  className="w-full"
                />
              </div>

              <div className="space-y-3">
                <Label>Tab Size: {settings.tabSize}</Label>
                <Slider
                  min={2}
                  max={8}
                  step={1}
                  value={[settings.tabSize]}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, tabSize: value[0] }))}
                  className="w-full"
                />
              </div>

              <div className="space-y-3">
                <Label>Line Height: {settings.lineHeight.toFixed(1)}</Label>
                <Slider
                  min={1}
                  max={2.5}
                  step={0.1}
                  value={[settings.lineHeight]}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, lineHeight: value[0] }))}
                  className="w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="word-wrap"
                  checked={settings.wordWrap}
                  onChange={(e) => setSettings((prev) => ({ ...prev, wordWrap: e.target.checked }))}
                  className="w-4 h-4"
                />
                <Label htmlFor="word-wrap" className="cursor-pointer">Word Wrap</Label>
              </div>

              <div className="border-t pt-4">
                <button
                  onClick={() => setThemeCollapsed(!themeCollapsed)}
                  className="w-full flex items-center justify-between mb-3 hover:opacity-80"
                >
                  <Label className="text-sm font-semibold cursor-pointer">Theme</Label>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      themeCollapsed && "rotate-180"
                    )}
                  />
                </button>

                {!themeCollapsed && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Dark Themes</p>
                      {darkThemes.map((theme) => {
                        const isActive = themeId === theme.id;
                        return (
                          <button
                            key={theme.id}
                            onClick={() => selectTheme(theme.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm rounded-md mb-1 transition-colors",
                              isActive
                                ? "bg-blue-600 text-white"
                                : "bg-muted hover:bg-muted/80"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{theme.name}</span>
                              {isActive ? <Check className="h-4 w-4" /> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t my-2" />
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Light Themes</p>
                      {lightThemes.map((theme) => {
                        const isActive = themeId === theme.id;
                        return (
                          <button
                            key={theme.id}
                            onClick={() => selectTheme(theme.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm rounded-md mb-1 transition-colors",
                              isActive
                                ? "bg-blue-600 text-white"
                                : "bg-muted hover:bg-muted/80"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{theme.name}</span>
                              {isActive ? <Check className="h-4 w-4" /> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className = "relative h-full min-h-0 overflow-y-auto invisible-scroll">
        <CodeMirror
          value={value}
          height={height}
          theme={themeExtension as unknown as Extension}
          className={cn("h-full min-h-0 text-[14px] overflow-auto cm-scroller invisible-scroll", settings.wordWrap && "whitespace-pre-wrap")}
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
          }}
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
            tabSize: settings.tabSize,
          }}
          indentWithTab
          extensions={[indentUnit.of(" ".repeat(settings.tabSize)), ...quickAccessExtensions, ...extensions]}
          onChange={(val) => onChange(val)}
        />
      </div>
    </div>
  );
}
