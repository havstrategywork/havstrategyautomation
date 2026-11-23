// Made-up report numbers for TEST accounts (scripts/test-connection.mjs), so the Reports page can be tried without Meta.
// Deterministic for a given account + date range (the page does not change on reload) and always labelled as demo data in the UI. Never used for real accounts.
import { days, prevRange, TOTALS, windows, type Content, type Dist, type Range, type Report } from "./igreport.ts";

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (const c of seed) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const PER_DAY: Record<string, number> = { reach: 900, views: 4200, accounts_engaged: 260, total_interactions: 380, likes: 300, comments: 28, saves: 55, shares: 24, replies: 9, reposts: 6, profile_links_taps: 14 };
const CAPTIONS = ["Monday glow routine in 3 steps", "New serum, same promise: less fuss, more glow", "Behind the scenes at the shoot", "5 mistakes you make with sunscreen", "Our bestseller is back in stock", "Get ready with me: festive edition", "What a dermatologist wants you to know", "Unboxing the winter collection", "Customer favourites this month", "How we pick our ingredients", "Weekend skin reset", "Quick tip: layering products in the right order", "Meet the team behind the brand", "Giveaway: tell us your skincare must-have"];
const thumb = (n: number) => { const h = (n * 47) % 360, svg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 65% 62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 65% 45%)"/></linearGradient></defs><rect width="112" height="112" fill="url(#g)"/></svg>`; return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`; };

export function demoReport(range: Range, seed: string): Report {
  const rnd = rng(`${seed}|${range.from}|${range.to}`), n = days(range), w = windows(range).length, within = (x: number, spread: number) => x * (1 - spread + rnd() * spread * 2);
  const cur: Record<string, number> = {}, prev: Record<string, number> = {};
  for (const m of TOTALS) {
    const perDay = PER_DAY[m.key] ?? 10, total = m.kind === "unique" ? perDay * Math.min(n, 30) * 0.6 : perDay * n; // distinct accounts per 30 days, other metrics add up over the period
    cur[m.key] = Math.round(within(total, 0.12)); prev[m.key] = Math.round(within(cur[m.key], 0.25));
  }
  const dist = (shares: Record<string, number>, total: number): Dist[] => Object.entries(shares).map(([key, s]) => ({ key, value: Math.round(total * s * within(1, 0.1)) })).sort((a, b) => b.value - a.value);
  const FORMAT = { REEL: 0.52, POST: 0.24, CAROUSEL_CONTAINER: 0.15, STORY: 0.09 };
  const media: Content[] = Array.from({ length: 14 }, (_, i) => {
    const reel = i % 3 === 0, reach = Math.round(within(reel ? 5200 : 1800, 0.5)), views = Math.round(reach * (reel ? 1.9 : 1.3)), likes = Math.round(reach * within(0.06, 0.4)), comments = Math.round(likes * within(0.09, 0.5)), shares = Math.round(likes * within(0.12, 0.5));
    const at = new Date(`${range.from}T10:00:00Z`); at.setUTCDate(at.getUTCDate() + Math.floor((i * Math.max(n - 1, 0)) / 13));
    return { id: `demo-${i}`, kind: reel ? "reel" : "post", img: thumb(i + 3), text: CAPTIONS[i % CAPTIONS.length], at: at.toISOString(), stats: { reach, views, likes, comments, shares, interactions: likes + comments + shares + Math.round(likes * 0.2) } };
  });
  const ok = <T,>(data: T) => ({ ok: true as const, data });
  return {
    range, prev: prevRange(range),
    account: ok({ username: "test_account", followers: 12840, following: 312, media: 187 }),
    totals: ok({ cur, prev, windows: w }),
    split: ok({ views: dist(FORMAT, cur.views), reach: dist(FORMAT, cur.reach), total_interactions: dist(FORMAT, cur.total_interactions) }),
    media: ok(media),
    audience: {
      gender: ok(dist({ Female: 0.63, Male: 0.36, Unknown: 0.01 }, 100)),
      age: ok(dist({ "13-17": 0.02, "18-24": 0.31, "25-34": 0.38, "35-44": 0.18, "45-54": 0.08, "55-64": 0.03 }, 100)),
      country: ok(dist({ India: 0.7, "United States": 0.09, "United Arab Emirates": 0.06, "United Kingdom": 0.05, Canada: 0.03, Singapore: 0.02 }, 100)),
      city: ok(dist({ Mumbai: 0.19, Delhi: 0.15, Bengaluru: 0.13, Pune: 0.08, Hyderabad: 0.07, Dubai: 0.05, Chennai: 0.05, Kolkata: 0.04 }, 100)),
    },
  };
}
