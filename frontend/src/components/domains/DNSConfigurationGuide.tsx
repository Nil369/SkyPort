import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Globe, ExternalLink } from "lucide-react";

interface DNSConfigurationGuideProps {
  serverIP?: string;
}

export function DNSConfigurationGuide({
  serverIP = "YOUR_SERVER_IP",
}: DNSConfigurationGuideProps) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="dns-guide"
        className="border rounded-xl overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-center gap-3 text-left">
            <Globe className="h-5 w-5 text-blue-500" />

            <div>
              <div className="font-semibold text-base">
                DNS Configuration Guide
              </div>

              <div className="text-sm text-muted-foreground font-normal">
                Configure domains, DNS records and HTTPS
              </div>
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent>
          <Card className="border-0 shadow-none rounded-none">
            <CardHeader className="pb-4 pt-0">
              <CardTitle className="text-lg">
                DNS & Reverse Proxy Setup
              </CardTitle>

              <CardDescription>
                Point your domain to this server and enable automatic HTTPS with
                Caddy.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Server IP */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-2 text-sm font-medium text-muted-foreground">
                  Your Server IP
                </div>

                <div className="rounded-md border bg-background px-3 py-2 font-mono text-sm">
                  {serverIP}
                </div>
              </div>

              {/* Nested Accordion */}
              <Accordion
                type="multiple"
                defaultValue={["a-record"]}
                className="w-full"
              >
                {/* A Record */}
                <AccordionItem value="a-record">
                  <AccordionTrigger className="text-sm font-semibold">
                    A Record (Recommended)
                  </AccordionTrigger>

                  <AccordionContent className="space-y-4">
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="success">Type A</Badge>

                        <span className="text-sm text-muted-foreground">
                          Point your domain directly to your VPS IP
                        </span>
                      </div>

                      <div className="rounded-md border bg-background p-3 font-mono text-sm space-y-1">
                        <div>Type: A</div>
                        <div>Name: example.com</div>
                        <div>Value: {serverIP}</div>
                        <div>TTL: 3600</div>
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>1. Open your domain DNS settings</p>
                        <p>2. Create an A record</p>
                        <p>3. Point it to your server IP</p>
                        <p>4. Wait for DNS propagation</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* CNAME */}
                <AccordionItem value="cname-record">
                  <AccordionTrigger className="text-sm font-semibold">
                    CNAME Record
                  </AccordionTrigger>

                  <AccordionContent className="space-y-4">
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">CNAME</Badge>

                        <span className="text-sm text-muted-foreground">
                          Map subdomains to another domain
                        </span>
                      </div>

                      <div className="rounded-md border bg-background p-3 font-mono text-sm space-y-1">
                        <div>Type: CNAME</div>
                        <div>Name: api.example.com</div>
                        <div>Value: example.com</div>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        Best for subdomains like{" "}
                        <span className="font-mono">www</span>,{" "}
                        <span className="font-mono">api</span>,{" "}
                        <span className="font-mono">docs</span>.
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Example */}
                <AccordionItem value="example">
                  <AccordionTrigger className="text-sm font-semibold">
                    Real Example
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                      <div className="text-sm">
                        Expose a React app running on{" "}
                        <span className="font-mono">localhost:3000</span>
                      </div>

                      <div className="rounded-md border bg-background p-3 font-mono text-sm space-y-1">
                        <div>Domain: myapp.example.com</div>
                        <div>Target Port: 3000</div>
                        <div>HTTPS: Enabled</div>
                      </div>

                      <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm">
                        Result:
                        <div className="mt-1 font-mono">
                          https://myapp.example.com
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Troubleshooting */}
                <AccordionItem value="troubleshooting">
                  <AccordionTrigger className="text-sm font-semibold">
                    Troubleshooting
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div className="rounded-lg border p-3">
                        • Ensure ports 80 and 443 are open
                      </div>

                      <div className="rounded-lg border p-3">
                        • Verify DNS points to your VPS IP
                      </div>

                      <div className="rounded-lg border p-3">
                        • Restart Caddy if SSL certificates fail
                      </div>

                      <div className="rounded-lg border p-3">
                        • DNS propagation may take time
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Resources */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <div className="text-sm font-semibold">
                  Helpful Resources
                </div>

                <div className="space-y-2 text-sm">
                  <button
                    onClick={() =>
                      window.open(
                        "https://caddyserver.com/docs/",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Caddy Documentation
                  </button>

                  <button
                    onClick={() =>
                      window.open(
                        "https://letsencrypt.org/docs/",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Let's Encrypt Docs
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}