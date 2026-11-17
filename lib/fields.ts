// Single place for sheet-derived rules. Change thresholds/statuses here only.
export const STATUSES = ["New", "DM Sent", "Replied", "Negotiating", "Agreed", "Declined"] as const;

export const tierOf = (f: number) =>
  f < 10_000 ? "Nano" : f < 100_000 ? "Micro" : f < 500_000 ? "Mid-tier" : f < 1_000_000 ? "Macro" : "Mega";

export const TIERS = ["Nano", "Micro", "Mid-tier", "Macro", "Mega"];
// [min, max) followers per tier; keep in step with tierOf above.
export const TIER_RANGE: Record<string, [number, number]> = { Nano: [0, 1e4], Micro: [1e4, 1e5], "Mid-tier": [1e5, 5e5], Macro: [5e5, 1e6], Mega: [1e6, 1e9] };
