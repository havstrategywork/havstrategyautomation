// Follow-up timing. Pure (no DB), so it can be tested on its own.
import type { Creator } from "./db";

export const FOLLOWUP_DAYS = Number(process.env.FOLLOWUP_DAYS ?? 3); // 0 turns follow-ups off
export const DAY = 864e5;

/** Pure rule: a creator gets ONE follow-up, FOLLOWUP_DAYS after the first DM, only while they have never replied. */
export const dueForFollowUp = (c: Pick<Creator, "dmSentAt" | "status" | "followUpSentAt" | "needsHuman">, now = Date.now(), days = FOLLOWUP_DAYS) =>
  days > 0 && !!c.dmSentAt && c.status === "DM Sent" && !c.followUpSentAt && !c.needsHuman && now - +new Date(c.dmSentAt) >= days * DAY;
