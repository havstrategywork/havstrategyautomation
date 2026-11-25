"use client";

import { useEffect, useState } from "react";
import { Users, CheckCircle2, Clock, Link2, AlertTriangle, Timer, Gauge, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Skeleton } from "@/components/access/ui/skeleton";
import { apiFetch } from "@/lib/access/api-client";
import type { DashboardKpis } from "@/lib/access/db/queries/clients";

const KPI_DEFS: { key: keyof DashboardKpis; label: string; icon: typeof Users; format: (v: number | null) => string }[] = [
  { key: "totalClients", label: "Total clients", icon: Users, format: (v) => String(v ?? 0) },
  { key: "fullyOnboarded", label: "Fully onboarded", icon: CheckCircle2, format: (v) => String(v ?? 0) },
  { key: "pendingOnboarding", label: "Pending onboarding", icon: Clock, format: (v) => String(v ?? 0) },
  { key: "connectedAccounts", label: "Connected accounts", icon: Link2, format: (v) => String(v ?? 0) },
  { key: "expiredAuthorizations", label: "Expired authorizations", icon: Timer, format: (v) => String(v ?? 0) },
  { key: "accountsRequiringAttention", label: "Needs attention", icon: AlertTriangle, format: (v) => String(v ?? 0) },
  { key: "avgOnboardingCompletionHours", label: "Avg. onboarding time", icon: Gauge, format: (v) => (v == null ? "-" : `${(v / 24).toFixed(1)}d`) },
  { key: "onboardingCompletionRate", label: "Completion rate", icon: TrendingUp, format: (v) => (v == null ? "-" : `${Math.round(v * 100)}%`) },
];

export default function DashboardOverviewPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    apiFetch<DashboardKpis>("/api/access/dashboard/kpis").then(setKpis).catch(() => null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted">Client onboarding and access status across your agency.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_DEFS.map((def) => (
          <Card key={def.key}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted">{def.label}</CardTitle>
              <def.icon className="h-4 w-4 text-muted" />
            </CardHeader>
            <CardContent>
              {kpis ? <p className="text-2xl font-semibold text-foreground">{def.format(kpis[def.key])}</p> : <Skeleton className="h-8 w-16" />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
