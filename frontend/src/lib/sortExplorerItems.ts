import type { FsItem } from "@/features/platform/api";

/** VS Code–style: rank by leading `.`, then leading digit, then locale. */
export function compareExplorerSegmentName(a: string, b: string): number {
  const rank = (name: string) => {
    if (name.startsWith(".")) return 0;
    if (/^\d/.test(name)) return 1;
    return 2;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Folders first; within each group, compareExplorerSegmentName. */
export function sortFsItemsExplorerStyle(items: FsItem[]): FsItem[] {
  return [...items].sort((x, y) => {
    if (x.is_dir !== y.is_dir) return x.is_dir ? -1 : 1;
    return compareExplorerSegmentName(x.name, y.name);
  });
}
