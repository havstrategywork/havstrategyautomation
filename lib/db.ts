import { MongoClient, ObjectId } from "mongodb";
import type { Role } from "./roles";
import type { MailStatus } from "./mail";

export type Creator = {
  _id?: ObjectId;
  name: string;
  igHandle?: string;
  email?: string;
  niches: string[];
  followers: number;
  engagementRate?: number; // percent, e.g. 3.2
  platforms?: string[];
  collab: { count: number; rating: number; notes: string }; // rating 0-5
  notes: string; // "Notes (from bio)"
  source: string; // how the row got in: "manual" | "claude-hunt" | "creator-marketing-hub" | "csv" | ...
  createdAt: Date;
  // sheet columns. Tier and Times Suggested are derived (see lib/fields.ts), never stored.
  igCategory?: string;
  location?: string;
  phone?: string;
  contactSource?: string; // where the email/phone came from
  suggestedVia?: ObjectId[]; // client ids
  status?: string; // one of STATUSES; missing = "New"
  dmSentAt?: Date;
  response?: string;
  quotedRate?: string; // money as text with currency, e.g. "10k INR" (see lib/money.ts)
  agreedRate?: string;
  outreachNotes?: string;
  lastChecked?: Date;
  followUpSentAt?: Date;
  watchedAt?: Date; // last time the replies run was handed this creator's chat to read (rotates the watch list)
  agreedAt?: Date; // when status became Agreed / Declined (set in PATCH /api/creators/:id), for the daily report
  declinedAt?: Date;
  undeliverable?: { reason: string; at: Date }; // Instagram said our DM can't be delivered (e.g. "can't receive your message"): no follow-ups, not shortlisted again
  needsHuman?: { reason: string; at: Date }; // Claude stops replying until a human resolves this
  // client review of agreed deals (see lib/deals.ts)
  dealClientId?: ObjectId; // which client this deal is for (from the first DM's client)
  batchId?: ObjectId; // the review sheet this creator is on
  clientDecision?: "yes" | "no"; // the client's answer, from the file a human uploaded
  clientNote?: string;
  decidedAt?: Date;
  guidelinesSentAt?: Date; // the guidelines email went out; later sheet changes are ignored
};
export type Client = {
  _id?: ObjectId;
  name: string;
  niches: string[]; // core niches the client wants
  related?: string[]; // looser/adjacent terms (e.g. "gym", "workout"): partial niche credit
  locations?: string[]; // preferred locations (substring match on creator.location)
  tierRates?: Record<string, string>; // per-tier cap, keyed by tier name (Nano, Micro, Mid-tier, Macro, Mega), e.g. { Nano: "10k INR" }; overrides maxRate for that tier
  maxRate?: string; // budget text with currency, e.g. "20k INR"; budget per creator: search excludes creators quoting above it, and Claude can never offer/agree above it
  dmTemplate?: string; // the user's pasted message, sent word for word; {{name}} / {{handle}} are filled per creator
  sheetUrl?: string; // the client's own Google Sheet (from the brief): each review batch becomes a new "Content creators" tab in it
  guidelinesTemplate?: string; // email sent to creators the client said Yes to. First line "Subject: ..."; {{name}} {{handle}} {{rate}} are filled in
  guidelinesFileUrl?: string; // static brand guidelines/deck (PDF or PPTX), same for every creator; attached as-is to the guidelines email
  guidelinesFileName?: string;
  termsDocId?: string; // master Terms Google Doc id ({{name}}/{{brand}} placeholders); merged + exported to a personalized PDF per creator
  followUpTemplate?: string; // optional nudges, texts separated by a "---" line; text N goes out on day FOLLOWUP_SCHEDULE[N-1] after the first DM while the creator has not replied
  offer?: string; // the brief Claude answers from: product, deliverables, terms, what we can/can't promise
  minFollowers: number;
  maxFollowers: number;
  weights: { niche: number; followers: number; engagement: number; collab: number; location?: number };
  notes: string;
};
export type Message = {
  _id?: ObjectId;
  creatorId: ObjectId;
  direction: "in" | "out";
  by?: "claude" | "human"; // out only: who wrote it. "human" = typed by a person directly in Instagram
  text: string;
  at: Date;
  status?: "queued" | "sent" | "failed"; // out only
  error?: string;
  price?: string; // out only, any price stated, e.g. "15k INR": any price stated in the message, so the ceiling can be enforced server-side
};
// One document (_id "state"): kill switch, run lock, heartbeat.
export type Control = {
  _id: string;
  paused?: { reason: string; at: Date }; // set by Claude on a block/challenge; only a human can clear it (dashboard button)
  run?: { id: string; kind: string; startedAt: Date }; // active run; considered dead after 20 min
  lastRun?: { kind: string; startedAt: Date; endedAt: Date; ok: boolean; note?: string };
};
export type Run = { _id?: ObjectId; kind: string; startedAt: Date; endedAt: Date; ok: boolean; note?: string }; // one row per finished run, for the daily report
export type Outreach = {
  _id?: ObjectId;
  creatorId: ObjectId;
  clientId?: ObjectId;
  channel: "ig" | "email";
  kind?: "first" | "followup" | "guidelines" | "terms"; // missing = first DM. Follow-ups go in the existing thread, at most one per creator. "terms" = the per-creator Doc merge failed (see sendGuidelines)
  greet?: string; // name used in the greeting, reused by the follow-up
  subject?: string;
  message: string;
  status: "queued" | "sent" | "failed";
  error?: string;
  createdAt: Date;
  sentAt?: Date;
};

// One review sheet sent to a client: the Agreed creators on it, and the Google Sheet they answer in.
// sheetId/url are unset for a client with no sheetUrl: the review happens as a plain .xlsx download instead of a Google Sheet (see lib/deals.ts#createLocalBatch).
export type DealBatch = { _id?: ObjectId; clientId: ObjectId; sheetId?: string; tab?: string; url?: string; creatorIds: ObjectId[]; createdAt: Date; sharedAt?: Date /* a human gave it to the client */; answeredAt?: Date /* a human uploaded the client's answers */ };

// A campaign brief from the dashboard chat. Lifecycle (who moves it):
//   new (dashboard) -> shortlisting (Cowork claims it) -> awaiting_approval (Cowork posted a shortlist)
//   -> approved (you approve in the dashboard; the DMs are queued right then) ; "Find more" sends it back to new ; failed = Cowork gave up (note says why)
export type ShortlistItem = { creatorId: ObjectId; tier: string; score?: number; why?: string; decision?: "approved" | "rejected" };
export type BriefDoc = {
  _id?: ObjectId; createdAt: Date; updatedAt: Date;
  status: "new" | "shortlisting" | "awaiting_approval" | "approved" | "failed" | "archived";
  client: string; products: { name: string; about: string }[]; rows: { tier: string; count: number; budget: number }[];
  currency: string; other: string; message: string; followUp: string; sheetUrl?: string;
  clientId?: ObjectId; draftMessage?: string; shortlist: ShortlistItem[]; note?: string; runs?: number;
};

// Dashboard login. Passwords are scrypt hashes; sessions store only a SHA-256 of the cookie token, so a DB leak can't be replayed.
export type User = { _id?: ObjectId; username: string; role?: Role; passwordHash: string; passwordChangedAt?: Date; fails?: number; lockCount?: number; lockedUntil?: Date; createdAt: Date };
export type Session = { _id?: ObjectId; tokenHash: string; userId: ObjectId; createdAt: Date; lastSeen: Date; expiresAt: Date; ip?: string; ua?: string };
export type LoginAttempt = { _id: string; n: number; resetAt: Date }; // per-IP failed-login counter, expires by itself

// Email agent records: one row per conversation (see lib/mail.ts), plus one per finished run.
export type MailThread = {
  _id?: ObjectId; key: string; mailbox: string; email: string; name?: string; subject: string; category?: string;
  status: MailStatus; price?: string; note?: string; url?: string; followUps: number; lastFollowUpAt?: Date; createdAt: Date; updatedAt: Date;
};
export type MailRun = { _id?: ObjectId; at: Date; ok: boolean; note?: string };

// Social-media dashboard. An org holds its Metricool login (token stored encrypted, see lib/secrets.ts); its Instagram accounts are imported from the Metricool brands.
export type Org = { _id?: ObjectId; name: string; metricool?: { userId: string; token: string; syncedAt?: Date }; createdAt: Date };
export type SocialAccount = { _id?: ObjectId; orgId: ObjectId; blogId: number; brand: string; igHandle: string; picture?: string; connection?: string; syncedAt: Date };

// Reuse one connection across requests and dev hot reloads. A FAILED attempt is forgotten, so the next request retries
// (e.g. after a DNS blip or an .env fix) instead of replaying the same error until someone restarts the server.
const g = globalThis as unknown as { _mongo?: Promise<MongoClient>; _idx?: Promise<unknown> };
const connect = () =>
  (g._mongo ??= new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 15000 }).connect().catch((e) => { g._mongo = undefined; throw e; }));

// Unique handle/email, but only for real strings: a null/blank value (cleared field) must not collide.
// Drops the first-version sparse indexes (igHandle_1/email_1) if they still exist.
async function setupIndexes(d: ReturnType<MongoClient["db"]>) {
  const c = d.collection("creators");
  for (const f of ["igHandle", "email"]) {
    await c.dropIndex(`${f}_1`).catch(() => {});
    await c.createIndex({ [f]: 1 }, { unique: true, name: `${f}_uniq`, partialFilterExpression: { [f]: { $type: "string" } } });
  }
  await d.collection("users").createIndex({ username: 1 }, { unique: true });
  await d.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true });
  await d.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // expired sessions delete themselves
  await d.collection("loginAttempts").createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("briefs").createIndex({ status: 1, createdAt: 1 });
  await d.collection("mailThreads").createIndex({ key: 1 }, { unique: true });
  await d.collection("mailThreads").createIndex({ status: 1, updatedAt: -1 });
  await d.collection("socialAccounts").createIndex({ orgId: 1, blogId: 1 }, { unique: true });
}

export async function db() {
  const d = (await connect()).db();
  await (g._idx ??= setupIndexes(d).catch((e) => { g._idx = undefined; throw e; }));
  return {
    creators: d.collection<Creator>("creators"),
    clients: d.collection<Client>("clients"),
    outreach: d.collection<Outreach>("outreach"),
    messages: d.collection<Message>("messages"),
    control: d.collection<Control>("control"),
    runs: d.collection<Run>("runs"),
    users: d.collection<User>("users"),
    sessions: d.collection<Session>("sessions"),
    loginAttempts: d.collection<LoginAttempt>("loginAttempts"),
    briefs: d.collection<BriefDoc>("briefs"),
    dealBatches: d.collection<DealBatch>("dealBatches"),
    mailThreads: d.collection<MailThread>("mailThreads"),
    mailRuns: d.collection<MailRun>("mailRuns"),
    orgs: d.collection<Org>("orgs"),
    socialAccounts: d.collection<SocialAccount>("socialAccounts"),
  };
}

export const IG_CAP = Number(process.env.IG_DAILY_CAP ?? 75);
export const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

export async function sentToday(channel: "ig" | "email") {
  const { outreach } = await db();
  return outreach.countDocuments({ channel, status: "sent", sentAt: { $gte: startOfToday() } });
}

// Test-mode guard. If IG_ALLOWLIST is set, nothing is delivered to anyone else.
// Enforced server-side in /api/outreach/next, and /api/outreach/:id/sent, so a prompt can't bypass it.
const allowList = (v?: string) => (v ?? "").split(",").map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
export const igAllowed = (handle?: string) => { const l = allowList(process.env.IG_ALLOWLIST); return !l.length || (!!handle && l.includes(handle.toLowerCase())); };
