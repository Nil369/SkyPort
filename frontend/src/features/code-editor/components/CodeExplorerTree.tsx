import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";

import type { FsItem } from "@/features/platform/api";
import { platformApi } from "@/features/platform/api";
import { sortFsItemsExplorerStyle } from "@/lib/sortExplorerItems";
import { getFileIcon } from "@/lib/fileIcons";

type Props = {
  rootPath: string;
  depth: number;
  /** Path of the folder whose children are currently open in the editor (for open-folder icon). */
  activeDirPath: string;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (item: FsItem) => void;
};

export function CodeExplorerTree({ rootPath, depth, activeDirPath, onOpenDirectory, onOpenFile }: Props) {
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
    <div className="select-none">
      {sorted.map((item) => {
        const pad = 4 + depth * 14;
        if (item.is_dir) {
          const isOpen = Boolean(expanded[item.path]);
          const isActiveDir = activeDirPath === item.path;
          return (
            <div key={item.path}>
              <div
                className="flex w-full items-center gap-0.5 rounded-md py-0.5 pr-1 hover:bg-muted/80"
                style={{ paddingLeft: pad }}
              >
                <button
                  type="button"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((prev) => ({ ...prev, [item.path]: !isOpen }));
                    onOpenDirectory(item.path);
                  }}
                >
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    setExpanded((prev) => ({ ...prev, [item.path]: !isOpen }));
                    onOpenDirectory(item.path);
                  }}
                >
                  {isActiveDir ? (
                    <FolderOpen className="size-4 shrink-0 fill-primary/25 text-primary" />
                  ) : (
                    <Folder className="size-4 shrink-0 fill-primary/20 text-primary" />
                  )}
                  <span className="truncate">{item.name}</span>
                </button>
              </div>
              {isOpen ? (
                <CodeExplorerTree
                  rootPath={item.path}
                  depth={depth + 1}
                  activeDirPath={activeDirPath}
                  onOpenDirectory={onOpenDirectory}
                  onOpenFile={onOpenFile}
                />
              ) : null}
            </div>
          );
        }
        const iconCfg = getFileIcon(item.name);
        return (
          <button
            key={item.path}
            type="button"
            className="flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-sm hover:bg-muted"
            style={{ paddingLeft: pad + 22 }}
            onClick={() => onOpenFile(item)}
          >
            <span style={{ color: iconCfg.color }}>{iconCfg.icon}</span>
            <span className="truncate">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}
