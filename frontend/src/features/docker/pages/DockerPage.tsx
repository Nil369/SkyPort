import { useMutation, useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformApi } from "@/features/platform/api";

export function DockerPage() {
  const status = useQuery({ queryKey: ["docker-status"], queryFn: platformApi.dockerStatus });
  const containers = useQuery({ queryKey: ["docker-containers"], queryFn: platformApi.listContainers });
  const daemon = useMutation({ mutationFn: platformApi.dockerDaemon, onSuccess: () => status.refetch() });

  return (
    <PageShell>
      <PageHeader title="Docker" subtitle="Containers, images, volumes, and warnings" />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={status.data?.installed ? "success" : "danger"}>
            {status.data?.installed ? "Docker installed" : "Docker not installed"}
          </Badge>
          <Badge variant={status.data?.daemon_running ? "success" : "warning"}>
            {status.data?.daemon_running ? "Daemon running" : "Daemon stopped"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => daemon.mutate("start")}>
            Start
          </Button>
          <Button size="sm" variant="outline" onClick={() => daemon.mutate("restart")}>
            Restart
          </Button>
          <Button size="sm" variant="destructive" onClick={() => daemon.mutate("stop")}>
            Stop
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Containers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(containers.data?.containers ?? []).map((c: any) => (
                <TableRow key={String(c.id)}>
                  <TableCell>{String(c.names ?? "-")}</TableCell>
                  <TableCell>{String(c.image ?? "-")}</TableCell>
                  <TableCell>{String(c.status ?? "-")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
