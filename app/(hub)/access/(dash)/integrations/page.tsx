"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Badge } from "@/components/access/ui/badge";
import { Skeleton } from "@/components/access/ui/skeleton";
import { Button } from "@/components/access/ui/button";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import type { PlatformMeta } from "@/lib/access/integrations/catalog";

interface IntegrationsResponse {
  mode: "demo" | "production";
  integrations: (PlatformMeta & { configured: boolean })[];
  /** Present once the Google Ads variables are set (real mode): whether the agency's manager account is connected. */
  googleAdsAgency: { connection: { connectedAt: string; connectedBy: string } | null } | null;
}

const CONNECT_RESULT: Record<string, string> = {
  connected: "Google Ads manager account connected.",
  denied: "Google sign-in was not completed.",
  failed: "Google rejected the sign-in. Check the OAuth client settings and try again.",
  no_refresh_token: "Google did not return lasting access. Remove this app from your Google account's permissions, then connect again.",
  not_manager: "That Google account can't act for the manager account in GOOGLE_ADS_MANAGER_CUSTOMER_ID (or the Google Ads API isn't enabled for this project).",
  encrypt: "TOKEN_ENCRYPTION_KEY_REFERENCE is missing or invalid, so the authorization couldn't be stored.",
  config: "Google Ads variables are incomplete.",
  not_configured: "Google Ads can be connected once its variables are set and demo mode is off.",
};

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<IntegrationsResponse | null>(null);

  const load = useCallback(() => {
    apiFetch<IntegrationsResponse>("/api/access/settings/integrations").then(setData).catch(() => null);
  }, []);

  useEffect(load, [load]);

  // Result of the Google sign-in, handed back in the address by the callback.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google_ads");
    if (!result || !CONNECT_RESULT[result]) return;
    toast({ title: CONNECT_RESULT[result], variant: result === "connected" ? "success" : "destructive" });
    window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);

  async function disconnectAds() {
    try {
      await apiFetch("/api/access/settings/google-ads/connect", { method: "DELETE" });
      toast({ title: "Google Ads manager account disconnected", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to disconnect", variant: "destructive" });
    }
  }

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
              <Clock className="h-4 w-4 text-info" /> Demo Mode is active - all integrations are simulated regardless of configuration.
            </div>
          ) : null}

          <div>
                        <div className="grid gap-4 sm:grid-cols-3">
              {data.integrations.map((platform) => (
                <Card key={platform.key}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle>{platform.label}</CardTitle>
                    {platform.configured ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Badge variant={platform.configured ? "success" : "destructive"}>{platform.configured ? "Configured" : "Not configured"}</Badge>
                    {platform.key === "google_ads" && data.googleAdsAgency ? (
                      data.googleAdsAgency.connection ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted">
                            Manager account connected by {data.googleAdsAgency.connection.connectedBy} on {new Date(data.googleAdsAgency.connection.connectedAt).toLocaleDateString("en-GB")}.
                          </p>
                          <Button size="sm" variant="outline" onClick={disconnectAds}>
                            Disconnect
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-muted">Sign in with a Google user of your agency&apos;s manager account, so access requests can be sent to clients.</p>
                          <Button size="sm" asChild>
                            {/* A full navigation, not client routing: it leaves for Google. */}
                            <a href="/api/access/settings/google-ads/connect">Connect manager account</a>
                          </Button>
                        </div>
                      )
                    ) : null}
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

        </>
      )}
    </div>
  );
}
