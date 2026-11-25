import type { AnyDb } from "@/lib/access/db";
import { insertNotification, recentDuplicateExists } from "@/lib/access/db/queries/notifications";
import { sendEmail, pingOpsWebhook } from "@/lib/access/email";
import { renderNotification, type NotificationContext } from "./templates";
import { PRODUCT_SHORT_NAME } from "@/lib/access/branding";
import type { NotificationType } from "@/lib/access/types";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

type Recipient =
  | { kind: "agency_user"; userId: string; email: string }
  | { kind: "client"; email: string };

/**
 * Fans a notification out to in-app (agency users only - clients have no
 * persistent dashboard in this product) and email, deduplicating per
 * (client, type, channel) within a 24h window so a flapping connection
 * doesn't spam anyone (section 17: "avoid duplicate/excessive notifications").
 * Never throws - a notification failure must never break the caller's
 * actual mutation.
 */
export async function notify(
  db: AnyDb,
  input: { organizationId: string; clientId: string; type: NotificationType; recipients: Recipient[]; context: NotificationContext },
): Promise<void> {
  try {
    const { subject, html, text } = renderNotification(input.type, input.context);

    for (const recipient of input.recipients) {
      const recipientId = recipient.kind === "agency_user" ? recipient.userId : null;

      if (recipient.kind === "agency_user") {
        const dup = await recentDuplicateExists(db, { clientId: input.clientId, notificationType: input.type, channel: "in_app", withinMs: DEDUPE_WINDOW_MS, recipientId });
        if (!dup) {
          await insertNotification(db, {
            organizationId: input.organizationId,
            clientId: input.clientId,
            recipientId: recipient.userId,
            recipientType: "agency_user",
            notificationType: input.type,
            channel: "in_app",
            deliveryStatus: "sent",
            payload: input.context,
          });
        }
      }

      const emailDup = await recentDuplicateExists(db, { clientId: input.clientId, notificationType: input.type, channel: "email", withinMs: DEDUPE_WINDOW_MS, recipientId });
      if (emailDup) continue;

      const result = await sendEmail({ to: recipient.email, subject, html, text });
      await insertNotification(db, {
        organizationId: input.organizationId,
        clientId: input.clientId,
        recipientId: recipient.kind === "agency_user" ? recipient.userId : null,
        recipientType: recipient.kind,
        notificationType: input.type,
        channel: "email",
        deliveryStatus: result.ok ? (result.skipped ? "skipped_no_config" : "sent") : "failed",
        payload: input.context,
      });
    }

    if (["expired_authorization", "revoked_access", "incomplete_permissions"].includes(input.type)) {
      void pingOpsWebhook(`${PRODUCT_SHORT_NAME}: ${input.context.brandName} - ${input.type.replaceAll("_", " ")}`);
    }
  } catch (err) {
    console.error("notify() failed (non-fatal):", err);
  }
}
