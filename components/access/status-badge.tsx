import { CheckCircle2, Clock, AlertTriangle, XCircle, Ban, HelpCircle, Hourglass, Link2Off } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/access/ui/badge";
import { titleCase } from "@/lib/access/utils";
import type { DisplayConnectionStatus, OnboardingStatus } from "@/lib/access/types";

const CONNECTION_STATUS_MAP: Record<DisplayConnectionStatus, { label: string; variant: BadgeProps["variant"]; icon: typeof CheckCircle2 }> = {
  not_requested: { label: "Not requested", variant: "default", icon: HelpCircle },
  invitation_sent: { label: "Invitation sent", variant: "info", icon: Clock },
  client_viewed: { label: "Client viewed", variant: "info", icon: Clock },
  authorization_started: { label: "Authorization started", variant: "warning", icon: Hourglass },
  authorization_denied: { label: "Authorization denied", variant: "destructive", icon: XCircle },
  application_authorized: { label: "App authorized", variant: "info", icon: Clock },
  asset_selection_required: { label: "Asset selection required", variant: "warning", icon: AlertTriangle },
  agency_approval_pending: { label: "Agency approval pending", variant: "warning", icon: Hourglass },
  partially_connected: { label: "Partially connected", variant: "warning", icon: AlertTriangle },
  connected_and_verified: { label: "Connected & verified", variant: "success", icon: CheckCircle2 },
  insufficient_permissions: { label: "Insufficient permissions", variant: "destructive", icon: AlertTriangle },
  authorization_expired: { label: "Authorization expired", variant: "warning", icon: Clock },
  access_revoked: { label: "Access revoked", variant: "destructive", icon: Ban },
  disconnected: { label: "Disconnected", variant: "default", icon: Link2Off },
  integration_error: { label: "Integration error", variant: "destructive", icon: XCircle },
};

export function ConnectionStatusBadge({ status }: { status: DisplayConnectionStatus }) {
  const entry = CONNECTION_STATUS_MAP[status] ?? CONNECTION_STATUS_MAP.not_requested;
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant}>
      <Icon className="h-3 w-3" />
      {entry.label}
    </Badge>
  );
}

const ONBOARDING_STATUS_VARIANT: Record<OnboardingStatus, BadgeProps["variant"]> = {
  not_started: "default",
  invited: "info",
  in_progress: "warning",
  completed: "success",
  archived: "default",
};

export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  return <Badge variant={ONBOARDING_STATUS_VARIANT[status]}>{titleCase(status)}</Badge>;
}
