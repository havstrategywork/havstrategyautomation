"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/access/ui/card";
import { EmptyState } from "@/components/access/ui/empty-state";
import { Skeleton } from "@/components/access/ui/skeleton";
import { Button } from "@/components/access/ui/button";
import { useToast } from "@/components/access/ui/toast";
import { ConnectionStatusBadge } from "@/components/access/status-badge";
import { apiFetch } from "@/lib/access/api-client";
import { timeAgo } from "@/lib/access/utils";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import type { DisplayConnectionStatus, Platform } from "@/lib/access/types";

interface AttentionItem {
  clientId: string;
  brandName: string;
  platform: string;
  displayStatus: DisplayConnectionStatus;
  connectionHealth: string;
  errorMessage: string | null;
  lastVerifiedAt: string | null;
}

export default function AccessManagementPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AttentionItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<AttentionItem[]>("/api/access/access/attention"));
    } catch {
      toast({ title: "Failed to load", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkClient(clientId: string) {
    try {
      await apiFetch(`/api/access/clients/${clientId}/check-access`, { method: "POST" });
      toast({ title: "Checked", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Access Management</h1>
        <p className="text-sm text-muted">Connections across every client that need a second look.</p>
      </div>

      {!items ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Everything's healthy" description="No connections currently need attention." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.clientId}-${item.platform}`} className="flex items-center justify-between p-4">
              <div>
                <Link href={`/access/clients/${item.clientId}`} className="font-medium text-foreground hover:underline">
                  {item.brandName}
                </Link>
                <p className="text-xs text-muted">{PLATFORM_CATALOG[item.platform as Platform]?.label ?? item.platform}</p>
                {item.errorMessage ? <p className="mt-1 max-w-md text-xs text-warning">{item.errorMessage}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <ConnectionStatusBadge status={item.displayStatus} />
                  <p className="mt-1 text-xs text-muted">{item.lastVerifiedAt ? `Checked ${timeAgo(item.lastVerifiedAt)}` : "Never verified"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => checkClient(item.clientId)}>
                  Check now
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
