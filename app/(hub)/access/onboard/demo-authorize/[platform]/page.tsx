import { getAppMode } from "@/lib/access/env";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import { isPlatform } from "@/lib/access/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/access/ui/card";
import { Badge } from "@/components/access/ui/badge";
import { Button } from "@/components/access/ui/button";
import { ShieldAlert } from "lucide-react";

/**
 * Stands in for the real provider's own OAuth consent screen - ONLY ever
 * linked to from lib/integrations/demo/factory.ts `initiateAuthorization`,
 * and only reachable when APP_MODE=demo. Terminates at the exact same
 * /api/oauth/[platform]/callback that a real provider redirect would use,
 * so the rest of the pipeline is identical in both modes (section 21:
 * "simulated connections" must never be presented as real access - the
 * banner below is the one place that distinction has to be explicit).
 */
export default async function DemoAuthorizePage({ params, searchParams }: { params: Promise<{ platform: string }>; searchParams: Promise<{ state?: string }> }) {
  const { platform } = await params;
  const { state } = await searchParams;
  const demoMode = getAppMode() === "demo";
  const label = isPlatform(platform) ? PLATFORM_CATALOG[platform].label : platform;

  if (!demoMode) {
    return (
      <Centered>
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
        <p className="text-center text-sm text-foreground">This page only exists in Demo Mode. In production, this platform&apos;s own real authorization screen is used instead.</p>
      </Centered>
    );
  }

  if (!state) {
    return (
      <Centered>
        <p className="text-center text-sm text-foreground">Missing authorization state - go back and click Connect again.</p>
      </Centered>
    );
  }

  const base = `/api/access/oauth/${platform}/callback?state=${encodeURIComponent(state)}`;

  return (
    <Centered>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Badge variant="warning" className="mb-2 w-fit">
            Demo Mode - simulated screen
          </Badge>
          <CardTitle>Authorize {label}</CardTitle>
          <p className="text-sm text-muted">This stands in for {label}&apos;s own real authorization screen. No real account is contacted.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" asChild>
            <a href={`${base}&code=demo-approve-full`}>Approve full access</a>
          </Button>
          <Button className="w-full" variant="secondary" asChild>
            <a href={`${base}&code=demo-approve-partial`}>Approve limited access</a>
          </Button>
          <Button className="w-full" variant="outline" asChild>
            <a href={`${base}&error=access_denied`}>Deny</a>
          </Button>
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-surface p-6">{children}</div>;
}
