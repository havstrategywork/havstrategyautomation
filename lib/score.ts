import type { Client, Creator } from "./db";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const low = (s: string) => s.toLowerCase();
const NEUTRAL = 0.5; // missing data neither helps nor sinks a creator (hunted rows are often incomplete)

/** Each factor 0..1. `location` is null when the client has no location preference. */
export function scoreParts(c: Creator, cl: Client) {
  const wants = cl.niches.map(low);
  const tags = new Set(c.niches.map(low));
  const text = low([...c.niches, c.igCategory ?? "", c.notes].join(" "));
  // exact tag = full credit; mention in category/bio notes = 0.7; adjacent ("related") term = 0.6 at most
  const core = wants.length ? wants.reduce((a, t) => a + (tags.has(t) ? 1 : text.includes(t) ? 0.7 : 0), 0) / wants.length : 1;
  const related = (cl.related ?? []).some((t) => text.includes(low(t))) ? 0.6 : 0;
  const niche = Math.max(core, related);

  // 1 inside [min,max]; decays linearly to 0 at 50% outside the range. 0 followers = unknown.
  const { minFollowers: lo, maxFollowers: hi } = cl;
  const f = c.followers;
  const followers = !f ? NEUTRAL : f >= lo && f <= hi ? 1 : f < lo ? clamp(1 - (lo - f) / (lo * 0.5 || 1)) : clamp(1 - (f - hi) / (hi * 0.5 || 1));

  const engagement = c.engagementRate == null ? NEUTRAL : clamp(c.engagementRate / 6); // 6%+ = full marks
  const collab = c.collab.count ? clamp(c.collab.rating / 5) : NEUTRAL;

  const locs = (cl.locations ?? []).map(low);
  const location = !locs.length ? null : !c.location ? NEUTRAL : locs.some((l) => low(c.location!).includes(l)) ? 1 : 0;
  return { niche, followers, engagement, collab, location };
}

/** 0-100 fit of a creator for a client. Weights are normalised, so only ratios matter. */
export function score(c: Creator, cl: Client): number {
  const p = scoreParts(c, cl), w = cl.weights;
  const pairs: [number, number][] = [[p.niche, w.niche], [p.followers, w.followers], [p.engagement, w.engagement], [p.collab, w.collab]];
  if (p.location !== null) pairs.push([p.location, w.location ?? 2]);
  const total = pairs.reduce((a, [, wt]) => a + wt, 0) || 1;
  return Math.round((pairs.reduce((a, [v, wt]) => a + v * wt, 0) / total) * 100);
}
