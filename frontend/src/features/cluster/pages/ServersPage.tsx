import * as React from "react";
import { Server, Plus, RefreshCw, SquareTerminal } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VPSList } from "@/components/VPSManagement/VPSList";
import { VPSAddEditForm } from "@/components/VPSManagement/VPSAddEditForm";
import { SSHTerminal } from "@/components/VPSManagement/SSHTerminal";
import { useVPSList } from "@/hooks/useVPS";

export function ServersPage() {
  // VPS Management State
  const [activeTab, setActiveTab] = React.useState("instances");
  const [showVPSForm, setShowVPSForm] = React.useState(false);
  const [selectedVPS, setSelectedVPS] = React.useState<string | null>(null);
  const { data: vpsList, isLoading: vpsLoading, refetch: refetchVPS } = useVPSList();

  const handleOpenTerminal = (vpsId: string) => {
    setSelectedVPS(vpsId);
    setActiveTab("terminal");
  };

  return (
    <PageShell>
      <PageHeader
        title="VPS Cluster"
        subtitle="Manage VPS instances and access SSH terminals directly from your browser"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="instances">
            <Server className="size-4 mr-2" />
            VPS Instances ({vpsList?.data?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="terminal">
            <span className="mr-2"><SquareTerminal className="size-4" /></span>
            SSH Terminal
          </TabsTrigger>
        </TabsList>

        {/* VPS Instances Tab */}
        <TabsContent value="instances" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">VPS Servers</h3>
              <p className="text-sm text-muted-foreground">Manage your VPS infrastructure</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchVPS()}
                disabled={vpsLoading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowVPSForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Server
              </Button>
            </div>
          </div>

          {vpsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading VPS instances...</div>
          ) : (
            <VPSList
              onSelectVPS={setSelectedVPS}
              onOpenTerminal={handleOpenTerminal}
            />
          )}

          {showVPSForm && (
            <VPSAddEditForm
              onClose={() => setShowVPSForm(false)}
              onSuccess={() => {
                setShowVPSForm(false);
                refetchVPS();
              }}
            />
          )}
        </TabsContent>

        {/* Terminal Tab */}
        <TabsContent value="terminal" className="space-y-4 h-[calc(100vh-280px)]">
          {selectedVPS ? (
            <div className="h-full flex flex-col gap-4">
              <div className="flex items-center justify-between bg-card p-3 rounded-lg border">
                <div className="flex items-center gap-4">
                  <h3 className="font-medium">
                    Connected to: <span className="text-primary font-mono">{vpsList?.data?.find(v => v.id === selectedVPS)?.server_name || selectedVPS}</span>
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => setSelectedVPS(null)}>
                    Switch Server
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <SSHTerminal vpsId={selectedVPS} />
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 space-y-4">
                  <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                    <SquareTerminal className="w-6 h-6 text-primary" />
                  </div>
                  <div className="max-w-md mx-auto">
                    <h3 className="text-lg font-semibold">Open SSH Terminal</h3>
                    <p className="text-muted-foreground mb-6">Select an online VPS instance to start a secure shell session</p>
                    
                    <div className="grid gap-2 text-left">
                      {vpsList?.data?.map((v: any) => (
                        <Button 
                          key={v.id}
                          variant="outline" 
                          className="justify-between group"
                          onClick={() => setSelectedVPS(v.id)}
                        >
                          <div className="flex items-center">
                            <Server className="w-4 h-4 mr-2 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span>{v.server_name}</span>
                            <span className="ml-2 text-xs text-muted-foreground font-mono">({v.ip_address})</span>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${v.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                        </Button>
                      ))}
                      {(!vpsList?.data || vpsList.data.length === 0) && (
                        <p className="text-center text-sm text-muted-foreground py-4 italic">No servers available. Add a server first.</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
