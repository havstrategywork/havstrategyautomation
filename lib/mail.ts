// The email agent's records (see the "mail" prompt on the Automation page). The agent POSTs what it did; the Email dashboard shows it.
export const MAILBOXES = { info: { label: "info@havstrategy.in", url: "https://mail.hostinger.com/1/mailboxes/INBOX" }, editorial: { label: "editorial@havstrategy.in", url: "https://mail.hostinger.com/0/mailboxes/INBOX" } } as const;
export type Mailbox = keyof typeof MAILBOXES;

// The doc's action statuses, trimmed to what the dashboard counts.
export const MAIL_STATUSES = ["negotiating", "follow_up", "closed", "founder_review", "awaiting_sender", "draft", "forward_draft", "no_action"] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];
export const STATUS_LABEL: Record<MailStatus, string> = { negotiating: "Negotiating", follow_up: "Follow-up", closed: "Closed", founder_review: "Founder review", awaiting_sender: "Awaiting sender", draft: "Draft ready", forward_draft: "Forward drafted", no_action: "No action" };

/** One row per conversation: same mailbox + sender + subject (Re:/Fwd: stripped) is the same thread, so a re-push updates instead of duplicating. */
export const threadKey = (mailbox: string, email: string, subject = "") =>
  `${mailbox}|${email.trim().toLowerCase()}|${subject.replace(/^(\s*(re|fwd?|aw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200)}`;
