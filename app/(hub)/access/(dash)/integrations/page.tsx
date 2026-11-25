"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Badge } from "@/components/access/ui/badge";
import { Skeleton } from "@/components/access/ui/skeleton";
import { apiFetch } from "@/lib/access/api-client";
import type { PlatformMeta } from "@/lib/access/integrations/catalog";

interface IntegrationsResponse {
  mode: "demo" | "production";
  phase1: (PlatformMeta & { configured: boolean })[];
  phase2: PlatformMeta[];
}

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);

  useEffect(() => {
    apiFetch<IntegrationsResponse>("/api/access/settings/integrations").then(setData).catch(() => null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="text-sm text-muted">Platform credentials are configured via environment variables, never in this UI.</p>
      </div>

      {!data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {data.mode === "demo" ? (
            <div className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg p-3 text-sm text-foreground">
              <Clock className="h-4 w-4 text-info" /> Demo Mode is active - all Phase 1 integrations are simulated regardless of configuration.
            </div>
          ) : null}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Phase 1 - available now</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {data.phase1.map((platform) => (
                <Card key={platform.key}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle>{platform.label}</CardTitle>
                    {platform.configured ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Badge variant={platform.configured ? "success" : "destructive"}>{platform.configured ? "Configured" : "Not configured"}</Badge>
                    {platform.requiresVerification ? (
                      <p className="flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {platform.requiresVerification}
                      </p>
                    ) : null}
                    <a href={platform.officialDocsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Official docs <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Phase 2 - coming soon</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.phase2.map((platform) => (
                <div key={platform.key} className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
                  {platform.label}
                  <Badge variant="default" className="ml-2">
                    Upcoming
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
