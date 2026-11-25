"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, MoreHorizontal, Archive, ArchiveRestore, Bell, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Input } from "@/components/access/ui/input";
import { Select } from "@/components/access/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/access/ui/table";
import { Avatar } from "@/components/access/ui/avatar";
import { EmptyState } from "@/components/access/ui/empty-state";
import { Skeleton } from "@/components/access/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/access/ui/dropdown-menu";
import { OnboardingStatusBadge } from "@/components/access/status-badge";
import { apiFetch } from "@/lib/access/api-client";
import { useToast } from "@/components/access/ui/toast";
import { timeAgo } from "@/lib/access/utils";
import { ONBOARDING_STATUSES } from "@/lib/access/types";
import type { Client } from "@/lib/access/db/schema-types";

interface ClientsResponse {
  rows: Client[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ClientsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ClientsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    try {
      const result = await apiFetch<ClientsResponse>(`/api/access/clients?${params.toString()}`);
      setData(result);
    } catch {
      toast({ title: "Failed to load clients", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function archive(id: string, archived: boolean) {
    try {
      await apiFetch(`/api/access/clients/${id}/${archived ? "unarchive" : "archive"}`, { method: "POST" });
      toast({ title: archived ? "Client restored" : "Client archived", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Action failed", variant: "destructive" });
    }
  }

  async function regenerateLink(id: string) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/access/clients/${id}/invitations/regenerate`, { method: "POST" });
      await navigator.clipboard.writeText(result.url).catch(() => null);
      toast({ title: "New onboarding link created", description: "Copied to clipboard. The previous link no longer works.", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not generate link", variant: "destructive" });
    }
  }

  async function sendReminder(id: string) {
    try {
      await apiFetch(`/api/access/clients/${id}/invitations/remind`, { method: "POST" });
      toast({ title: "Reminder sent", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not send reminder", variant: "destructive" });
    }
  }

  async function checkAccess(id: string) {
    try {
      await apiFetch(`/api/access/clients/${id}/check-access`, { method: "POST" });
      toast({ title: "Access check complete", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Check failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted">Manage brand onboarding and connected accounts.</p>
        </div>
        <Button asChild>
          <Link href="/access/clients/new">
            <Plus className="h-4 w-4" />
            New client
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Search brand or email..." className="pl-9" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        </div>
        <Select className="w-48" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All statuses</option>
          {ONBOARDING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No clients yet"
          description="Create your first client to generate a secure onboarding link."
          action={
            <Button asChild size="sm">
              <Link href="/access/clients/new">Create client</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((client) => (
                <TableRow key={client.id} className="cursor-pointer" onClick={() => router.push(`/access/clients/${client.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={client.brandName} src={client.logoUrl} />
                      <span className="font-medium text-foreground">{client.brandName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p className="text-foreground">{client.contactName}</p>
                      <p className="text-muted">{client.contactEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OnboardingStatusBadge status={client.onboardingStatus as never} />
                  </TableCell>
                  <TableCell className="text-sm text-muted">{(client.requiredPlatforms as string[]).join(", ")}</TableCell>
                  <TableCell className="text-sm text-muted">{timeAgo(client.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-md p-1.5 hover:bg-surface focus-visible:outline-none">
                        <MoreHorizontal className="h-4 w-4 text-muted" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/access/clients/${client.id}`)}>View client</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => regenerateLink(client.id)}>
                          <RefreshCw className="h-3.5 w-3.5" /> New onboarding link
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => sendReminder(client.id)}>
                          <Bell className="h-3.5 w-3.5" /> Send reminder
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => checkAccess(client.id)}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Check access
                        </DropdownMenuItem>
                        {client.archivedAt ? (
                          <DropdownMenuItem onSelect={() => archive(client.id, true)}>
                            <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => archive(client.id, false)}>
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              {data.total} client{data.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
