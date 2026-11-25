import { AlertTriangle } from "lucide-react";

const REASONS: Record<string, string> = {
  missing_state: "The authorization response was missing required security information.",
  invalid_state: "This authorization link has expired or was already used. Please go back and click Connect again.",
  invitation_not_found: "We couldn't match this authorization back to an onboarding invitation.",
  client_not_found: "We couldn't find the client this invitation belongs to.",
  unsupported_platform: "This platform isn't supported.",
};

export default async function OnboardErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = (reason && REASONS[reason]) || "Something went wrong completing this authorization.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-warning" />
        <h1 className="text-lg font-semibold text-foreground">We hit a snag</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}
