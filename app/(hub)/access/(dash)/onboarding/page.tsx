"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Badge } from "@/components/access/ui/badge";
import { Card } from "@/components/access/ui/card";
import { EmptyState } from "@/components/access/ui/empty-state";
import { Skeleton } from "@/components/access/ui/skeleton";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { formatDate, timeAgo } from "@/lib/access/utils";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import type { Platform } from "@/lib/access/types";

interface PendingInvitation {
  id: string;
  clientId: string;
  brandName: string;
  contactEmail: string;
  requestedPlatforms: string[];
  viewedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export default function OnboardingPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingInvitation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<PendingInvitation[]>("/api/access/invitations");
      setItems(result);
    } catch {
      toast({ title: "Failed to load invitations", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function remind(clientId: string) {
    try {
      await apiFetch(`/api/access/clients/${clientId}/invitations/remind`, { method: "POST" });
      toast({ title: "Reminder sent", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function regenerate(clientId: string) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/access/clients/${clientId}/invitations/regenerate`, { method: "POST" });
      await navigator.clipboard.writeText(result.url).catch(() => null);
      toast({ title: "New link copied to clipboard", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Onboarding</h1>
        <p className="text-sm text-muted">Invitations awaiting a client&apos;s action.</p>
      </div>

      {!items ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing pending" description="Every invitation has been opened and completed, or none have been sent yet." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className={item.viewedAt ? "text-info" : "text-muted"}>{item.viewedAt ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</div>
                <div>
                  <Link href={`/access/clients/${item.clientId}`} className="font-medium text-foreground hover:underline">
                    {item.brandName}
                  </Link>
                  <p className="text-xs text-muted">{item.contactEmail}</p>
                  <div className="mt-1 flex gap-1">
                    {item.requestedPlatforms.map((p) => (
                      <Badge key={p} variant="default">
                        {PLATFORM_CATALOG[p as Platform]?.label ?? p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">{item.viewedAt ? `Opened ${timeAgo(item.viewedAt)}` : "Not opened yet"}</p>
                <p className="text-xs text-muted">Expires {formatDate(item.expiresAt)}</p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => remind(item.clientId)}>
                    <Bell className="h-3.5 w-3.5" /> Remind
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => regenerate(item.clientId)}>
                    <RefreshCw className="h-3.5 w-3.5" /> New link
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
