import { Outlet, Link, useLocation } from "react-router";

import { Logo } from "@/components/brand/Logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AuthLayout() {
  const location = useLocation();
  const isSetup = location.pathname.startsWith("/setup");

  return (
    <div className="h-dvh w-full overflow-x-clip bg-background text-foreground">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 h-64 w-136 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl sm:w-176 lg:w-208" />
        <div className="absolute -bottom-24 left-1/3 h-64 w-120 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl sm:w-160 lg:w-3xl" />
      </div>

      <div className="absolute right-4 top-4 z-10">
        <ModeToggle />
      </div>

      <div className="relative mx-auto flex h-dvh w-full max-w-275 items-center justify-center px-4 py-6 sm:px-6">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="hidden lg:flex flex-col justify-center">
            <Logo size="lg" className="gap-3" />
            <div className="mt-6 space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Lightweight Developer Cloud OS</h1>
              <p className="text-sm text-muted-foreground">
                Realtime infrastructure control surface — optimized for low-end VPS.
              </p>
            </div>
            <div className="mt-8 text-xs text-muted-foreground">
              {isSetup ? (
                <span>First-time setup creates the initial administrator.</span>
              ) : (
                <span>
                  New install? <Link className={cn("text-primary hover:underline")} to="/setup">Run setup</Link>.
                </span>
              )}
            </div>
          </div>

          <div className="w-full max-w-lg justify-self-center">
            <div className="mb-4 flex justify-center lg:hidden">
              <Logo size="lg" />
            </div>
            <Card className="w-full p-5 shadow-lg sm:p-8">
              <Outlet />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
