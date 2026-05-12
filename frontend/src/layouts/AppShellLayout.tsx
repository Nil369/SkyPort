import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AnimatedOutlet } from "@/components/layout/AnimatedOutlet";
import { WebSocketStatusBanner } from "@/components/layout/WebSocketStatusBanner";

export function AppShellLayout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <WebSocketStatusBanner />
          <TopBar />
          <main className="flex-1 p-4">
            <AnimatedOutlet />
          </main>
        </div>
      </div>
    </div>
  );
}
