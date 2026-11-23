// Report history. Meta gives period totals (and keeps ~90 days), so a daily job saves one row per account per day (the report charts are drawn from these)
// plus follower counts and stories (stories disappear after 24 hours). Test connections (scripts/test-connection.mjs) are never touched.
import { db, type BotConnection, type IgDaily, type IgStory } from "./db.ts";
import { addDays, getTotals, liveStories, todayIn, type Range } from "./igreport.ts";
import { graphGet } from "./meta.ts";
import { unseal } from "./secrets.ts";

/** One finished day's totals. */
async function snapshotDay(c: BotConnection, token: string, date: string) {
  const m = await getTotals(token, c.igId, { from: date, to: date });
  await (await db()).igDaily.updateOne({ _id: `${c.igId}:${date}` }, { $set: { igId: c.igId, date, m, at: new Date() } }, { upsert: true });
}

/** Today's follower count goes on today's row (the number can't be looked up for past days, so this is how follower history builds). */
async function snapshotFollowers(c: BotConnection, token: string, today: string) {
  const a = await graphGet<{ followers_count?: number }>(`/${c.igId}`, token, { fields: "followers_count" });
  if (typeof a.followers_count !== "number") return;
  await (await db()).igDaily.updateOne({ _id: `${c.igId}:${today}` }, { $set: { followers: a.followers_count }, $setOnInsert: { igId: c.igId, date: today, m: {}, at: new Date() } }, { upsert: true });
}

async function snapshotStories(c: BotConnection, token: string) {
  const { igStories } = await db(), now = new Date();
  const stories = await liveStories(token, c.igId);
  if (stories.length) await igStories.bulkWrite(stories.map((s) => ({ updateOne: { filter: { _id: `${c.igId}:${s.id}` }, update: { $set: { igId: c.igId, at: new Date(s.at ?? now), permalink: s.url, img: s.img, text: s.text, stats: s.stats, seenAt: now } }, upsert: true } })));
  return stories.length;
}

export type SnapResult = { igId: string; username?: string; days: number; stories: number; failedDays: number; error?: string };

/** Saves the last `days` finished days (skipping days already saved when `onlyMissing`), today's followers and the live stories. Never throws: the error is returned. */
export async function snapshotConnection(c: BotConnection, days: number, onlyMissing = false, now = todayIn()): Promise<SnapResult> {
  const res: SnapResult = { igId: c.igId, username: c.username, days: 0, stories: 0, failedDays: 0 };
  try {
    const token = unseal(c.token), { igDaily } = await db();
    const wanted = Array.from({ length: days }, (_, i) => addDays(now, -(i + 1)));
    const have = onlyMissing ? new Set((await igDaily.find({ igId: c.igId, date: { $in: wanted }, "m.reach": { $exists: true } }).project({ date: 1 }).toArray()).map((r) => r.date)) : new Set<string>();
    const todo = wanted.filter((d) => !have.has(d));
    const done = await Promise.allSettled(todo.map((d) => snapshotDay(c, token, d)));
    res.days = done.filter((r) => r.status === "fulfilled").length; res.failedDays = done.length - res.days;
    const firstFail = done.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstFail && !res.days) res.error = firstFail.reason instanceof Error ? firstFail.reason.message : "Meta refused the request.";
    await snapshotFollowers(c, token, now).catch((e) => { res.error ??= e instanceof Error ? e.message : "Could not read followers."; });
    res.stories = await snapshotStories(c, token).catch(() => 0);
  } catch (e) { res.error = e instanceof Error ? e.message : "Could not read the saved token."; }
  return res;
}

/** The daily job: every real (non-test) connection. The last 3 days are re-saved each time, so a missed run or Meta's up-to-48h delay heals itself. */
export async function snapshotAll(days = 3) {
  const conns = await (await db()).botConnections.find({ test: { $ne: true } }).toArray(), out: SnapResult[] = [];
  for (const c of conns) out.push(await snapshotConnection(c, days));
  return out;
}

export const dailyRows = async (igId: string, r: Range): Promise<IgDaily[]> => (await db()).igDaily.find({ igId, date: { $gte: r.from, $lte: r.to } }).sort({ date: 1 }).toArray();
export const storiesIn = async (igId: string, r: Range): Promise<IgStory[]> => (await db()).igStories.find({ igId, at: { $gte: new Date(`${r.from}T00:00:00Z`), $lte: new Date(`${r.to}T23:59:59Z`) } }).sort({ at: -1 }).limit(100).toArray();
