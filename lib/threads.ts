import { ObjectId } from "mongodb";
import { db, igAllowed, type Creator } from "./db";
import { capFor, type Money } from "./money";

export const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Timestamp that keeps insertion order within a thread, even for messages logged in the same millisecond. */
export async function nextAt(creatorId: ObjectId) {
  const last = await (await db()).messages.find({ creatorId }).sort({ at: -1 }).limit(1).next();
  return new Date(Math.max(Date.now(), last ? +last.at + 1 : 0));
}

/** True if the same text in the same direction is already among the thread's last 10 messages (the poster re-sent what it already logged). */
export async function alreadyLogged(creatorId: ObjectId, direction: "in" | "out", text: string) {
  const recent = await (await db()).messages.find({ creatorId }).sort({ at: -1 }).limit(10).toArray();
  return recent.some((m) => m.direction === direction && norm(m.text) === norm(text));
}

/** Resolve a creator by id or @handle. */
export async function findCreator(b: { creatorId?: string; igHandle?: string }) {
  const { creators } = await db();
  if (b.creatorId && ObjectId.isValid(b.creatorId)) return creators.findOne({ _id: new ObjectId(b.creatorId) });
  if (b.igHandle) return creators.findOne({ igHandle: b.igHandle.replace(/^@/, "").toLowerCase() });
  return null;
}

/** The client a conversation is about: the most recent one the creator was suggested to. */
export async function clientFor(c: Creator) {
  const last = c.suggestedVia?.at(-1);
  return last ? (await db()).clients.findOne({ _id: last }) : null;
}

/** Lowest budget ceiling among the creator's clients (conservative), if any has one. ponytail: compares within the first ceiling's currency only. */
export async function ceilingFor(c: Creator): Promise<Money | undefined> {
  const { clients } = await db();
  const cs = c.suggestedVia?.length ? await clients.find({ _id: { $in: c.suggestedVia } }).toArray() : [];
  const caps = cs.map((x) => capFor(x, c.followers)).filter((m): m is Money => !!m);
  return caps.filter((m) => m.cur === caps[0]?.cur).sort((a, b) => a.amt - b.amt)[0];
}

/** Latest message per creator, with the last `n` messages of each thread. */
export async function threads(n = 15) {
  const { messages, creators } = await db();
  const all = await messages.find().sort({ at: -1 }).limit(1000).toArray();
  const byCreator = new Map<string, typeof all>();
  for (const m of all) byCreator.set(String(m.creatorId), [...(byCreator.get(String(m.creatorId)) ?? []), m]);
  const cs = new Map((await creators.find({ _id: { $in: [...byCreator.keys()].map((i) => new ObjectId(i)) } }).toArray()).map((c) => [String(c._id), c]));
  return [...byCreator].flatMap(([id, ms]) => {
    const creator = cs.get(id);
    return creator ? [{ creator, last: ms[0], thread: ms.slice(0, n).reverse() }] : [];
  });
}

export { igAllowed };
