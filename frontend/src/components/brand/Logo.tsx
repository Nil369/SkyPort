import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
};

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

export function Logo({ className, variant = "full", size = "md" }: Props) {
  const markSize = size === "sm" ? "size-6" : size === "lg" ? "size-12" : "size-7";
  const titleSize = size === "lg" ? "text-lg" : "text-sm";
  const subtitleSize = size === "lg" ? "text-xs" : "text-[11px]";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative grid place-items-center", markSize)}>
        <img
          src={logoSrc}
          alt="SkyPort"
          className={cn(markSize, "select-none object-contain")}
          draggable={false}
        />
      </div>
      {variant === "full" ? (
        <div className="leading-none">
          <div className={cn(titleSize, "font-semibold tracking-tight")}>SkyPort</div>
          <div className={cn(subtitleSize, "text-muted-foreground")}>Developer Cloud OS</div>
        </div>
      ) : null}
    </div>
  );
}
