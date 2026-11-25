import type { NotificationType } from "@/lib/access/types";
import { PRODUCT_SHORT_NAME } from "@/lib/access/branding";

export interface NotificationContext {
  brandName: string;
  platformLabel?: string;
  managerName?: string;
  onboardingUrl?: string;
  [key: string]: unknown;
}

const TEMPLATES: Record<NotificationType, (ctx: NotificationContext) => { subject: string; body: string }> = {
  new_invitation: (ctx) => ({
    subject: `Connect your marketing accounts for ${ctx.brandName}`,
    body: ctx.onboardingUrl
      ? `You've been invited to securely connect your marketing accounts. Open your personalized link to get started: ${ctx.onboardingUrl}`
      : `You have a pending invitation to securely connect your marketing accounts with us. Please check the original email for your personalized link, or reply to this message and we'll resend it.`,
  }),
  invitation_opened: (ctx) => ({
    subject: `${ctx.brandName} opened their onboarding link`,
    body: `${ctx.brandName} has opened the onboarding portal and may begin connecting accounts shortly.`,
  }),
  pending_platform_connection: (ctx) => ({
    subject: `${ctx.brandName}: ${ctx.platformLabel ?? "a platform"} connection needs attention`,
    body: `${ctx.brandName} started connecting ${ctx.platformLabel ?? "a platform"} but hasn't finished asset selection yet.`,
  }),
  pending_partner_approval: (ctx) => ({
    subject: `${ctx.brandName}: agency access pending approval`,
    body: `${ctx.brandName}'s ${ctx.platformLabel ?? "platform"} assets are selected; agency partner access is pending the platform's approval.`,
  }),
  successful_connection: (ctx) => ({
    subject: `${ctx.brandName}: ${ctx.platformLabel ?? "a platform"} connected and verified`,
    body: `${ctx.platformLabel ?? "A platform"} access for ${ctx.brandName} has been verified and is ready to use.`,
  }),
  incomplete_permissions: (ctx) => ({
    subject: `${ctx.brandName}: ${ctx.platformLabel ?? "a platform"} granted fewer permissions than requested`,
    body: `${ctx.brandName} approved ${ctx.platformLabel ?? "a platform"} with fewer permissions than requested. Review and follow up with the client.`,
  }),
  expired_authorization: (ctx) => ({
    subject: `${ctx.brandName}: ${ctx.platformLabel ?? "a platform"} authorization expired`,
    body: `${ctx.brandName}'s ${ctx.platformLabel ?? "platform"} authorization has expired and needs to be reconnected.`,
  }),
  revoked_access: (ctx) => ({
    subject: `${ctx.brandName}: access revoked`,
    body: `${ctx.brandName} revoked ${ctx.platformLabel ? `access to ${ctx.platformLabel}` : "agency access"}.`,
  }),
  onboarding_completed: (ctx) => ({
    subject: `${ctx.brandName}: onboarding complete`,
    body: `${ctx.brandName} has finished connecting and verifying all requested platforms.`,
  }),
};

export function renderNotification(type: NotificationType, ctx: NotificationContext): { subject: string; html: string; text: string } {
  const { subject, body } = TEMPLATES[type](ctx);
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#171717;max-width:480px"><p>${escapeHtml(body)}</p><p style="color:#6b7280;font-size:13px;margin-top:24px">Sent by ${PRODUCT_SHORT_NAME}</p></div>`;
  return { subject, html, text: body };
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
