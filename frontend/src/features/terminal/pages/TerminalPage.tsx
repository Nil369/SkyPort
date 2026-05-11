import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { TerminalEmulator } from "@/features/terminal/components/TerminalEmulator";

export function TerminalPage() {
  return (
    <PageShell className="max-w-350">
      <PageHeader title="Terminal" subtitle="Realtime shell over WebSocket" />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[70vh] bg-background">
            <TerminalEmulator />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
