"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/access/ui/table";
import { EmptyState } from "@/components/access/ui/empty-state";
import { Skeleton } from "@/components/access/ui/skeleton";
import { Badge } from "@/components/access/ui/badge";
import { apiFetch } from "@/lib/access/api-client";
import { formatDateTime, titleCase } from "@/lib/access/utils";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import type { AuditLog } from "@/lib/access/db/schema-types";
import type { Platform } from "@/lib/access/types";

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    apiFetch<AuditLog[]>("/api/access/audit-logs?limit=200").then(setLogs).catch(() => null);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Activity Logs</h1>
        <p className="text-sm text-muted">Every action across your agency&apos;s clients and integrations. Tokens and credentials are never shown here.</p>
      </div>

      {!logs ? (
        <Skeleton className="h-64 w-full" />
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No activity yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium text-foreground">{titleCase(log.action)}</TableCell>
                <TableCell className="text-muted">{log.platform ? PLATFORM_CATALOG[log.platform as Platform]?.label ?? log.platform : "-"}</TableCell>
                <TableCell>
                  <Badge variant="default">{titleCase(log.actorType)}</Badge>
                </TableCell>
                <TableCell className="text-muted">{formatDateTime(log.timestamp)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
