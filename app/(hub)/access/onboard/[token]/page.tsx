"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Lock, RefreshCw, Unlink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Checkbox } from "@/components/access/ui/checkbox";
import { Skeleton } from "@/components/access/ui/skeleton";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import { titleCase } from "@/lib/access/utils";
import type { DisplayConnectionStatus, Phase1Platform } from "@/lib/access/types";

interface OnboardAsset {
  externalAssetId: string;
  assetName: string;
  assetType: string;
  verificationStatus?: string;
  availablePermissions?: string[];
}

interface ConnectionView {
  platform: string;
  displayStatus: DisplayConnectionStatus;
  errorMessage: string | null;
  assets: OnboardAsset[];
}

interface OnboardData {
  brandName: string;
  contactName: string;
  requestedPlatforms: string[];
  personalizedMessage: string | null;
  completedAt: string | null;
  organization: { name: string; logoUrl: string | null };
  connections: ConnectionView[];
}

const NEEDS_SELECTION: DisplayConnectionStatus[] = ["asset_selection_required"];
const CONNECTED: DisplayConnectionStatus[] = ["connected_and_verified"];
const NEEDS_ATTENTION: DisplayConnectionStatus[] = ["insufficient_permissions", "authorization_expired", "authorization_denied", "integration_error", "agency_approval_pending"];
// Any state that isn't already mid-flow or done can (re)start the OAuth
// dance - including "authorization_started", so a client who closed the tab
// partway through is never stuck with only a Revoke button.
const CONNECT_ELIGIBLE: DisplayConnectionStatus[] = [
  "not_requested",
  "invitation_sent",
  "authorization_started",
  "authorization_denied",
  "authorization_expired",
  "integration_error",
  "access_revoked",
  "disconnected",
];

export default function OnboardingPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<OnboardData | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [selectingPlatform, setSelectingPlatform] = useState<string | null>(null);
  const [availableAssets, setAvailableAssets] = useState<OnboardAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<OnboardData>(`/api/access/public/onboard/${token}`);
      setData(result);
    } catch (e) {
      setNotFound(e instanceof Error ? e.message : "This link is invalid.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get("platform");
    const status = params.get("status");
    if (!platform || !status) return;

    const label = PLATFORM_CATALOG[platform as Phase1Platform]?.label ?? platform;
    if (status === "authorized") {
      toast({ title: `${label} authorized`, description: "Choose which accounts to share with the agency.", variant: "success" });
      load();
      openAssetSelection(platform);
    } else if (status === "denied") {
      toast({ title: `${label} authorization was not completed`, variant: "destructive" });
      load();
    } else {
      toast({ title: `Something went wrong connecting ${label}`, description: "Please try again.", variant: "destructive" });
      load();
    }
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openAssetSelection(platform: string) {
    setSelectingPlatform(platform);
    setAssetsLoading(true);
    setSelectedIds([]);
    try {
      const result = await apiFetch<{ assets: OnboardAsset[] }>(`/api/access/public/onboard/${token}/assets/${platform}`);
      setAvailableAssets(result.assets);
      setSelectedIds(result.assets.map((a) => a.externalAssetId));
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not load accounts", variant: "destructive" });
      setSelectingPlatform(null);
    } finally {
      setAssetsLoading(false);
    }
  }

  async function submitAssetSelection() {
    if (!selectingPlatform) return;
    setSubmitting(true);
    try {
      const selected = availableAssets.filter((a) => selectedIds.includes(a.externalAssetId));
      await apiFetch(`/api/access/public/onboard/${token}/assets/${selectingPlatform}`, { method: "POST", body: JSON.stringify({ selected }) });
      toast({ title: "Accounts shared", description: "We're verifying access now.", variant: "success" });
      setSelectingPlatform(null);
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to save selection", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(platform: string) {
    try {
      await apiFetch(`/api/access/public/onboard/${token}/revoke/${platform}`, { method: "POST" });
      toast({ title: "Access revoked", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  if (notFound) {
    return (
      <Centered>
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warning" />
        <p className="text-center text-sm text-foreground">{notFound}</p>
      </Centered>
    );
  }

  if (!data) {
    return (
      <Centered>
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </Centered>
    );
  }

  const allConnected = data.requestedPlatforms.every((p) => CONNECTED.includes(data.connections.find((c) => c.platform === p)?.displayStatus ?? "not_requested"));

  return (
    <div className="min-h-screen bg-surface py-10">
      <div className="mx-auto max-w-xl px-4">
        <header className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-medium text-success">
            <Lock className="h-3.5 w-3.5" /> Secure onboarding
          </div>
          <p className="text-sm text-muted">{data.organization.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Connect your marketing accounts</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Securely grant our team access to the marketing accounts we need to grow your brand. You remain in control of your accounts and can revoke access at any time.
          </p>
          {data.personalizedMessage ? <p className="mt-3 rounded-md border border-border bg-background p-3 text-sm text-foreground">{data.personalizedMessage}</p> : null}
        </header>

        {allConnected ? (
          <Card className="mb-6 border-success-border bg-success-bg">
            <CardContent className="flex flex-col items-center gap-2 pt-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="font-medium text-foreground">Your marketing accounts have been successfully connected.</p>
              <p className="text-sm text-muted">The agency has been notified and will be in touch with next steps.</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {data.requestedPlatforms.map((platform) => {
            const connection = data.connections.find((c) => c.platform === platform);
            const meta = PLATFORM_CATALOG[platform as Phase1Platform];
            const status = connection?.displayStatus ?? "not_requested";

            return (
              <Card key={platform}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>{meta?.label ?? platform}</CardTitle>
                  <StatusPill status={status} />
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted">{meta?.clientExplanation}</p>

                  {connection?.errorMessage && NEEDS_ATTENTION.includes(status) ? (
                    <p className="rounded-md border border-warning-border bg-warning-bg p-2.5 text-xs text-foreground">{connection.errorMessage}</p>
                  ) : null}

                  {connection && connection.assets.length > 0 ? (
                    <ul className="space-y-1.5 text-sm">
                      {connection.assets.map((a) => (
                        <li key={a.externalAssetId} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className="text-foreground">{a.assetName}</span>
                          <span className="text-xs text-muted">{titleCase(a.assetType)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex gap-2">
                    {CONNECT_ELIGIBLE.includes(status) ? (
                      <Button size="sm" asChild>
                        <a href={`/api/access/public/onboard/${token}/connect/${platform}`}>
                          {status === "not_requested" || status === "invitation_sent" ? "Connect" : "Reconnect"} {meta?.label}
                        </a>
                      </Button>
                    ) : null}
                    {NEEDS_SELECTION.includes(status) ? (
                      <Button size="sm" onClick={() => openAssetSelection(platform)}>
                        Select accounts
                      </Button>
                    ) : null}
                    {status !== "not_requested" && status !== "invitation_sent" && status !== "access_revoked" && status !== "disconnected" ? (
                      <Button size="sm" variant="outline" onClick={() => revoke(platform)}>
                        <Unlink className="h-3.5 w-3.5" /> Revoke access
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectingPlatform ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Choose accounts to share</CardTitle>
                <p className="text-sm text-muted">Only the accounts you select below will be shared with the agency.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {assetsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : availableAssets.length === 0 ? (
                  <p className="text-sm text-muted">No eligible accounts were found for this platform.</p>
                ) : (
                  availableAssets.map((asset) => (
                    <label key={asset.externalAssetId} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{asset.assetName}</p>
                        <p className="text-xs text-muted">
                          {titleCase(asset.assetType)} - {asset.externalAssetId.slice(0, 4)}***
                        </p>
                      </div>
                      <Checkbox
                        checked={selectedIds.includes(asset.externalAssetId)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((prev) => (checked ? [...prev, asset.externalAssetId] : prev.filter((id) => id !== asset.externalAssetId)))
                        }
                      />
                    </label>
                  ))
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setSelectingPlatform(null)}>
                    Cancel
                  </Button>
                  <Button onClick={submitAssetSelection} loading={submitting} disabled={selectedIds.length === 0}>
                    Confirm selection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" /> How this works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>- No passwords required - official platform authorization only</li>
              <li>- You retain full ownership of your accounts</li>
              <li>- Authorization credentials are encrypted</li>
              <li>- You can revoke access at any time</li>
              <li>- Billing ownership never changes</li>
            </ul>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted">
          Questions? Contact {data.organization.name} or see our <a href="/access/security" className="underline">security information</a>.
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: DisplayConnectionStatus }) {
  if (CONNECTED.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </span>
    );
  }
  if (NEEDS_ATTENTION.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <RefreshCw className="h-3.5 w-3.5" /> Needs attention
      </span>
    );
  }
  if (status === "not_requested" || status === "invitation_sent" || status === "access_revoked" || status === "disconnected") {
    return <span className="text-xs text-muted">Not connected</span>;
  }
  return <span className="text-xs font-medium text-info">In progress</span>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-surface p-6">{children}</div>;
}
