// Campaign priority: a client (= campaign) is high, normal (default) or low. It only changes ORDER: high-priority DMs, follow-ups and replies are
// handed out first, so under the daily cap and the per-run limits they go out before the others. Nothing is skipped or capped differently.
export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Sort key: 0 = high, 1 = normal (also when unset or unknown), 2 = low. */
export const rankOf = (p?: string | null) => (p === "high" ? 0 : p === "low" ? 2 : 1);
export const isPriority = (p: unknown): p is Priority => PRIORITIES.includes(p as Priority);
