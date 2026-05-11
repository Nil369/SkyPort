import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { platformApi } from "@/features/platform/api";

export function DomainsPage() {
  const [domain, setDomain] = React.useState("");
  const [port, setPort] = React.useState("80");
  const [email, setEmail] = React.useState("");
  const [result, setResult] = React.useState<Record<string, unknown> | null>(null);

  const generate = useMutation({
    mutationFn: platformApi.generateDomainProxy,
    onSuccess: (data) => {
      setResult(data as Record<string, unknown>);
      toast.success("Proxy config generated");
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? "Generation failed"),
  });

  return (
    <PageShell>
      <PageHeader title="Domains" subtitle="Domains, SSL, and routing" />

      <Card>
        <CardHeader>
          <CardTitle>Generate reverse proxy config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Input placeholder="Target port" value={port} onChange={(e) => setPort(e.target.value)} />
          <Input placeholder="Email (for TLS)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button
            onClick={() =>
              generate.mutate({
                domain: domain.trim(),
                port: Number(port),
                type: "caddy",
                enable_ssl: true,
                email: email.trim() || undefined,
              })
            }
            disabled={!domain.trim() || !port}
          >
            Generate config
          </Button>
          {result ? (
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
