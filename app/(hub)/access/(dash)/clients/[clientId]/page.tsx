"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, RefreshCw, Bell, ShieldCheck, Unlink, ExternalLink } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Badge } from "@/components/access/ui/badge";
import { Avatar } from "@/components/access/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/access/ui/tabs";
import { Skeleton } from "@/components/access/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/access/ui/dialog";
import { ConnectionStatusBadge, OnboardingStatusBadge } from "@/components/access/status-badge";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { formatDateTime, timeAgo, titleCase } from "@/lib/access/utils";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import type { Client, AuditLog } from "@/lib/access/db/schema-types";
import type { DisplayConnectionStatus, Phase1Platform } from "@/lib/access/types";

interface ConnectionWithAssets {
  id: string;
  platform: string;
  displayStatus: DisplayConnectionStatus;
  grantedScopes: string[];
  lastVerifiedAt: string | null;
  errorMessage: string | null;
  assets: { id: string; assetName: string; assetType: string; verificationStatus: string; grantedPermissions: string[] }[];
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { toast } = useToast();
  const [client, setClient] = useState<Client | null>(null);
  const [connections, setConnections] = useState<ConnectionWithAssets[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [clientData, connectionData, logData] = await Promise.all([
        apiFetch<Client>(`/api/access/clients/${clientId}`),
        apiFetch<ConnectionWithAssets[]>(`/api/access/clients/${clientId}/connections`),
        apiFetch<AuditLog[]>(`/api/access/audit-logs?clientId=${clientId}`),
      ]);
      setClient(clientData);
      setConnections(connectionData);
      setLogs(logData);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to load client", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyNewLink() {
    try {
      const result = await apiFetch<{ url: string }>(`/api/access/clients/${clientId}/invitations/regenerate`, { method: "POST" });
      await navigator.clipboard.writeText(result.url).catch(() => null);
      toast({ title: "New onboarding link copied", description: "The previous link no longer works.", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function sendReminder() {
    try {
      await apiFetch(`/api/access/clients/${clientId}/invitations/remind`, { method: "POST" });
      toast({ title: "Reminder sent", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function checkAccess() {
    try {
      await apiFetch(`/api/access/clients/${clientId}/check-access`, { method: "POST" });
      toast({ title: "Access check complete", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function disconnect(platform: string) {
    try {
      await apiFetch(`/api/access/clients/${clientId}/connections/${platform}/disconnect`, { method: "POST" });
      toast({ title: `${PLATFORM_CATALOG[platform as Phase1Platform]?.label ?? platform} disconnected`, variant: "success" });
      setDisconnectTarget(null);
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  if (loading || !client) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const requiredPlatforms = client.requiredPlatforms as string[];
  const connectedCount = connections.filter((c) => c.displayStatus === "connected_and_verified").length;
  const completionPct = requiredPlatforms.length ? Math.round((connectedCount / requiredPlatforms.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/access/clients" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to clients
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Avatar name={client.brandName} src={client.logoUrl} className="h-10 w-10" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">{client.brandName}</h1>
              <p className="text-sm text-muted">
                {client.contactName} - {client.contactEmail}
              </p>
            </div>
            <OnboardingStatusBadge status={client.onboardingStatus as never} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={sendReminder}>
            <Bell className="h-3.5 w-3.5" /> Remind
          </Button>
          <Button variant="outline" size="sm" onClick={checkAccess}>
            <ShieldCheck className="h-3.5 w-3.5" /> Check access
          </Button>
          <Button size="sm" onClick={copyNewLink}>
            <Copy className="h-3.5 w-3.5" /> Copy onboarding link
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Onboarding progress</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
          <p className="text-2xl font-semibold text-foreground">{completionPct}%</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connected accounts</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          {requiredPlatforms.map((platform) => {
            const connection = connections.find((c) => c.platform === platform);
            const meta = PLATFORM_CATALOG[platform as Phase1Platform];
            return (
              <Card key={platform}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>{meta?.label ?? platform}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted">{meta?.clientExplanation}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ConnectionStatusBadge status={connection?.displayStatus ?? "not_requested"} />
                    {connection && connection.displayStatus !== "not_requested" && connection.displayStatus !== "invitation_sent" ? (
                      <Dialog open={disconnectTarget === platform} onOpenChange={(open) => setDisconnectTarget(open ? platform : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Disconnect">
                            <Unlink className="h-4 w-4 text-muted" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Disconnect {meta?.label}?</DialogTitle>
                            <DialogDescription>
                              This revokes the application&apos;s authorization and deletes the stored credential. The client will need to reauthorize to reconnect.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>
                              Cancel
                            </Button>
                            <Button variant="destructive" onClick={() => disconnect(platform)}>
                              Disconnect
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {connection?.errorMessage ? (
                    <div className="rounded-md border border-warning-border bg-warning-bg p-3 text-xs text-foreground">{connection.errorMessage}</div>
                  ) : null}
                  {connection && connection.assets.length > 0 ? (
                    <div className="divide-y divide-border rounded-md border border-border">
                      {connection.assets.map((asset) => (
                        <div key={asset.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium text-foreground">{asset.assetName}</p>
                            <p className="text-xs text-muted">{titleCase(asset.assetType)}</p>
                          </div>
                          <Badge variant={asset.verificationStatus === "verified" ? "success" : asset.verificationStatus === "revoked" ? "default" : "warning"}>
                            {titleCase(asset.verificationStatus)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No assets selected yet.</p>
                  )}
                  {connection?.lastVerifiedAt ? <p className="text-xs text-muted">Last verified {timeAgo(connection.lastVerifiedAt)}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid grid-cols-2 gap-6 pt-5 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Website</p>
                <p className="mt-1 text-foreground">
                  {client.website ? (
                    <a href={client.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {client.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Industry</p>
                <p className="mt-1 text-foreground">{client.industry || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Permission preset</p>
                <p className="mt-1 text-foreground">{client.permissionPreset ? titleCase(client.permissionPreset) : "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Created</p>
                <p className="mt-1 text-foreground">{formatDateTime(client.createdAt)}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <div className="space-y-3">
            {logs.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                  <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                  <div className="flex-1 text-sm">
                    <p className="text-foreground">
                      {titleCase(log.action)}
                      {log.platform ? <span className="text-muted"> - {PLATFORM_CATALOG[log.platform as Phase1Platform]?.label ?? log.platform}</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {titleCase(log.actorType)} - {formatDateTime(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
