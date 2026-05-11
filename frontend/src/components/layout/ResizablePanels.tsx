import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  left: React.ReactNode;
  right: React.ReactNode;
  leftDefaultWidth?: number;
  leftMinWidth?: number;
  leftMaxWidth?: number;
  className?: string;
};

export function ResizablePanels({
  left,
  right,
  leftDefaultWidth = 320,
  leftMinWidth = 220,
  leftMaxWidth = 520,
  className,
}: Props) {
  const [leftWidth, setLeftWidth] = React.useState(leftDefaultWidth);
  const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(null);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const next = clamp(dragRef.current.startWidth + dx, leftMinWidth, leftMaxWidth);
      setLeftWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [leftMinWidth, leftMaxWidth]);

  return (
    <div className={cn("flex w-full overflow-hidden", className)}>
      <div style={{ width: leftWidth }} className="shrink-0">
        {left}
      </div>
      <div
        className="w-1.5 shrink-0 cursor-col-resize bg-border/60 hover:bg-border"
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startWidth: leftWidth };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        aria-label="Resize"
        role="separator"
      />
      <div className="min-w-0 flex-1">{right}</div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
