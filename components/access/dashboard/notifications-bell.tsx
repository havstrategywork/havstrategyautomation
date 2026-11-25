"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/access/ui/dropdown-menu";
import { apiFetch } from "@/lib/access/api-client";
import { timeAgo, titleCase } from "@/lib/access/utils";
import type { Notification } from "@/lib/access/db/schema-types";

export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    apiFetch<{ items: Notification[]; unread: number }>("/api/access/notifications")
      .then((data) => {
        setItems(data.items.slice(0, 8));
        setUnread(data.unread);
      })
      .catch(() => null);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-md p-2 hover:bg-surface focus-visible:outline-none">
        <Bell className="h-4.5 w-4.5 text-muted" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted">No notifications yet.</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5" asChild>
              <Link href="/access/notifications">
                <span className="text-sm font-medium text-foreground">{titleCase(n.notificationType)}</span>
                <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/access/notifications" className="justify-center text-xs text-primary">
            View all
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
