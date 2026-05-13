import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";

import type { FsItem } from "@/features/platform/api";
import { platformApi } from "@/features/platform/api";
import { sortFsItemsExplorerStyle } from "@/lib/sortExplorerItems";
import { getFileIcon } from "@/lib/fileIcons";
import { cn } from "@/lib/utils";

type Props = {
  rootPath: string;
  depth: number;
  /** Path of the folder whose children are currently open in the editor (for open-folder icon). */
  activeDirPath: string;
  selectedPath?: string;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (item: FsItem) => void;
};

export function CodeExplorerTree({
  rootPath,
  depth,
  activeDirPath,
  selectedPath,
  onOpenDirectory,
  onOpenFile,
}: Props) {
  const q = useQuery({
    queryKey: ["code-editor-files", rootPath],
    queryFn: () => platformApi.listFiles(rootPath),
    enabled: Boolean(rootPath),
  });
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const sorted = React.useMemo(() => sortFsItemsExplorerStyle(q.data?.items ?? []), [q.data?.items]);

  if (!rootPath) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">Select a project or path to browse.</div>;
  }

  if (q.isLoading) {
    return (
      <div className="px-2 py-2 text-xs text-muted-foreground" style={{ paddingLeft: 6 + depth * 14 }}>
        Loading…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="px-2 py-2 text-xs text-destructive" style={{ paddingLeft: 6 + depth * 14 }}>
        Failed to list folder.
      </div>
    );
  }

  return (
    <div className="relative select-none group/tree">
      {/* Indentation guide line */}
      {depth > 0 && (
        <div
          className="absolute left-[7px] top-0 bottom-0 w-[1px] bg-border/20 group-hover/tree:bg-border/40 transition-colors"
          style={{ left: (depth - 1) * 14 + 11 }}
        />
      )}
      {sorted.map((item) => {
        const pad = 4 + depth * 14;
        const isSelected = selectedPath === item.path;
        if (item.is_dir) {
          const isOpen = Boolean(expanded[item.path]);
          const isActiveDir = activeDirPath === item.path;
          return (
            <div key={item.path} className="group/dir">
              <div
                className={cn(
                  "relative flex w-full items-center gap-0.5 rounded-sm py-[2px] pr-1 transition-colors cursor-pointer",
                  isSelected ? "bg-primary/15 text-primary" : "hover:bg-muted/60"
                )}
                style={{ paddingLeft: pad }}
                onClick={() => {
                  setExpanded((prev) => ({ ...prev, [item.path]: !isOpen }));
                  onOpenDirectory(item.path);
                }}
              >
                {/* Active indicator */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                )}
                <button
                  type="button"
                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((prev) => ({ ...prev, [item.path]: !isOpen }));
                    onOpenDirectory(item.path);
                  }}
                >
                  {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>
                <div
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5 text-left text-sm"
                >
                  {isActiveDir ? (
                    <FolderOpen className="size-3.5 shrink-0 fill-primary/25 text-primary" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 fill-primary/20 text-primary" />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>
              </div>
              {isOpen ? (
                <CodeExplorerTree
                  rootPath={item.path}
                  depth={depth + 1}
                  activeDirPath={activeDirPath}
                  selectedPath={selectedPath}
                  onOpenDirectory={onOpenDirectory}
                  onOpenFile={onOpenFile}
                />
              ) : null}
            </div>
          );
        }
        const iconCfg = getFileIcon(item.name);
        return (
          <div key={item.path} className="relative group/file">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm py-1 pr-2 text-left text-sm transition-all duration-200 cursor-pointer",
                isSelected ? "bg-primary/20 text-primary font-medium shadow-sm" : "hover:bg-muted/80"
              )}
              style={{ paddingLeft: pad + 20 }}
              onClick={() => onOpenFile(item)}
            >
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
              )}
              <span className="shrink-0 transition-transform group-hover/file:scale-110" style={{ color: isSelected ? undefined : iconCfg.color }}>
                {iconCfg.icon}
              </span>
              <span className="truncate">{item.name}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
