// Follow-up timing. Pure (no DB), so it can be tested on its own.
import type { Creator } from "./db";

export const DAY = 864e5;
// Days after the FIRST DM at which follow-up 1, 2, 3, 4 go out. FOLLOWUP_SCHEDULE="" or "0" turns follow-ups off.
export const FOLLOWUP_SCHEDULE = (process.env.FOLLOWUP_SCHEDULE ?? "1,2,5,10").split(",").map(Number).filter((n) => n > 0);
export const FOLLOWUP_SEP = /^\s*---+\s*$/m; // a line of dashes separates the texts of follow-up 1, 2, 3, 4 inside the client's followUpTemplate
// Used when a client has no follow-up text of its own, so follow-ups are ON by default. A client opts out by saving the text "none".
export const DEFAULT_FOLLOWUPS = `Hi {{name}}, following up on my earlier message in case it got lost in your inbox. We'd love to hear if a collaboration is something you'd be open to. Happy to share the full brief whenever it suits you.
---
Hi {{name}}, a quick note to say we've been following your content and think it's a strong fit for this campaign. If you're interested, reply here with your availability and collaboration rates, and we'll send over the details.
---
Hi {{name}}, we're finalising our creator line-up for this campaign and would like to include you. If you're interested, a quick reply with your rates and availability is all we need to take the next step.
---
Hi {{name}}, this is our final follow-up. If the timing isn't right, no problem at all, and we'd be glad to stay in touch for future collaborations. Thank you for your time, and we wish you continued success.`;
export const stepTexts = (tpl?: string) => {
  const t = tpl?.trim() || DEFAULT_FOLLOWUPS;
  return /^none$/i.test(t) ? [] : t.split(FOLLOWUP_SEP).map((s) => s.trim()).filter(Boolean);
};

type C = Pick<Creator, "dmSentAt" | "status" | "needsHuman">;
/** Pure rule: which follow-up (0-based) goes out next, or -1. `done` = follow-ups already queued/sent/failed, `lastAt` = when the last one went out. Never two in one 24h, never after a reply. */
export const nextStep = (c: C, done: number, lastAt?: Date, now = Date.now(), schedule = FOLLOWUP_SCHEDULE) =>
  done < schedule.length && !!c.dmSentAt && c.status === "DM Sent" && !c.needsHuman
  && now - +new Date(c.dmSentAt) >= schedule[done] * DAY && (!lastAt || now - +lastAt >= DAY) ? done : -1;
