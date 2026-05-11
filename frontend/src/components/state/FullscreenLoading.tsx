import { Card } from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";
import { Skeleton } from "@/components/ui/skeleton";

const bannerSrc = `${import.meta.env.BASE_URL}banner.png`;

export function FullscreenLoading({ label }: { label: string }) {
  return (
    <div className="h-dvh bg-background text-foreground grid place-items-center p-4 overflow-hidden">
      <Card className="relative w-full max-w-lg overflow-hidden p-8">
        <div className="absolute right-3 top-3">
          <ModeToggle />
        </div>

        <div className="mt-3 space-y-8">
          <div className="w-full overflow-hidden rounded-xl border border-border/60 bg-card">
            <img
              src={bannerSrc}
              alt="SkyPort"
              className="block h-auto w-full select-none object-cover"
              draggable={false}
            />
          </div>

          {/* Booting State */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="relative flex h-3 w-3">
                {/* Pulsing ring */}
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />

                {/* Solid dot */}
                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
              </div>

              <div className="text-sm font-medium text-blue-400">
                {label}
              </div>
            </div>

            {/* Skeleton loaders */}
            <div className="space-y-3">
              <Skeleton className="h-3 w-full" />

              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}