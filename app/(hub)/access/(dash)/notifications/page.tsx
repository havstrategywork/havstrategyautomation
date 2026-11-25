"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Mail, Check } from "lucide-react";
import { Card } from "@/components/access/ui/card";
import { Badge } from "@/components/access/ui/badge";
import { EmptyState } from "@/components/access/ui/empty-state";
import { Skeleton } from "@/components/access/ui/skeleton";
import { apiFetch } from "@/lib/access/api-client";
import { formatDateTime, titleCase } from "@/lib/access/utils";
import type { Notification } from "@/lib/access/db/schema-types";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<{ items: Notification[] }>("/api/access/notifications");
    setItems(data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await apiFetch(`/api/access/notifications/${id}/read`, { method: "POST" });
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        <p className="text-sm text-muted">Everything sent to you via email or in-app.</p>
      </div>

      {!items ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={`flex items-center justify-between p-4 ${n.readAt ? "" : "border-primary/30 bg-primary/5"}`}>
              <div className="flex items-center gap-3">
                {n.channel === "email" ? <Mail className="h-4 w-4 text-muted" /> : <Bell className="h-4 w-4 text-muted" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{titleCase(n.notificationType)}</p>
                  <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={n.deliveryStatus === "sent" ? "success" : n.deliveryStatus === "failed" ? "destructive" : "default"}>{titleCase(n.deliveryStatus)}</Badge>
                {!n.readAt ? (
                  <button onClick={() => markRead(n.id)} className="rounded-md p-1.5 hover:bg-surface" title="Mark as read">
                    <Check className="h-4 w-4 text-muted" />
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
