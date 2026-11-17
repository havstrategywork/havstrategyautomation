// Single place for sheet-derived rules. Change thresholds/statuses here only.
export const STATUSES = ["New", "DM Sent", "Replied", "Negotiating", "Agreed", "Declined"] as const;

export const tierOf = (f: number) =>
  f < 10_000 ? "Nano" : f < 100_000 ? "Micro" : f < 500_000 ? "Mid-tier" : f < 1_000_000 ? "Macro" : "Mega";

export const TIERS = ["Nano", "Micro", "Mid-tier", "Macro", "Mega"];
