import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { TerminalEmulator } from "@/features/terminal/components/TerminalEmulator";

export function TerminalPage() {
  return (
    <PageShell className="max-w-350">
      <PageHeader title="Terminal" subtitle="Realtime shell over WebSocket" />

      <Card className="overflow-hidden">
        <CardContent className="space-y-2 p-3">
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs">
            <span className="mr-2 font-medium">Note:</span>
            <span className="mr-2">If terminal does not show output, refresh the page.</span>
            <span className="font-bold text-blue-500">PS E:\13_OPEN_SOURCE\SkyPort\backend&gt;</span>
          </div>
          <div className="h-[70vh] rounded-lg border border-border/60 bg-background p-2">
            <TerminalEmulator />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
