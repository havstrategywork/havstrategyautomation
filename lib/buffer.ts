// Buffer side of the social reports: Buffer's GraphQL API (https://api.buffer.com), a personal API key (publish.buffer.com/settings/api).
// A key reaches every organization and channel in its Buffer account. The shared one is BUFFER_API_KEY; a client with their own Buffer account
// gets their own key on the Organizations page (lib/bufferKeys.ts), which every function here takes as its last argument.
// What Buffer exposes is PER POST metrics (reach, impressions, reactions, ...) plus one aggregate over a date range, refreshed about once a day.
// There is no follower count or audience data, and Buffer calls the metrics API experimental and personal-key-only.
// Env: BUFFER_API_KEY, optional BUFFER_API_BASE (tests point it at a local stub).

export class BufferError extends Error {}
export const bufferKey = () => process.env.BUFFER_API_KEY ?? "";
const base = () => process.env.BUFFER_API_BASE ?? "https://api.buffer.com";

export type Range = { from: string; to: string }; // YYYY-MM-DD, both days included
export type Sec<T> = { ok: true; data: T } | { ok: false; error: string };
export type Content = { id: string; url?: string; img?: string; text?: string; at?: string; stats: Record<string, number> };
export type Channel = { id: string; organizationId: string; name: string; displayName?: string; service: string; avatar?: string; externalLink?: string; disconnected?: boolean; locked?: boolean };
export type Linked = { channelId: string; organizationId: string; name: string; service: string; avatar?: string }; // what an org stores about a channel it reports on

// unit "%" = a percentage. A metric Buffer does not report for a channel is simply absent (shown as a dash), never 0.
export const KPIS: { key: string; label: string; unit?: "%" }[] = [
  { key: "postCount", label: "Posts published" },
  { key: "reach", label: "Reach" },
  { key: "impressions", label: "Impressions" },
  { key: "views", label: "Views" },
  { key: "reactions", label: "Reactions" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
  { key: "reposts", label: "Reposts" },
  { key: "clicks", label: "Clicks" },
  { key: "follows", label: "New followers from posts" },
  { key: "engagementRate", label: "Engagement rate", unit: "%" },
];

// ---- dates (plain YYYY-MM-DD strings; UTC maths so a timezone never shifts a day) ----
const DAY = 864e5, ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const days = (r: Range) => Math.round((ms(r.to) - ms(r.from)) / DAY) + 1;
export const prevRange = (r: Range): Range => ({ from: addDays(r.from, -days(r)), to: addDays(r.from, -1) });
export const todayIn = (tz = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
export const MAX_DAYS = 365; // Buffer's aggregate accepts at most a year, starting no more than 2 years back

/** ?range=7|30|90 or custom ?from=&to=. Anything invalid falls back to the last 30 days; a custom range is capped at a year and can't end in the future. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, today: string): { range: Range; preset: string } {
  const n = Number(sp.range);
  if ([7, 30, 90].includes(n)) return { range: { from: addDays(today, -(n - 1)), to: today }, preset: String(n) };
  if (sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && !Number.isNaN(ms(sp.from)) && !Number.isNaN(ms(sp.to))) {
    const to = sp.to > today ? today : sp.to;
    const from = sp.from > to ? to : sp.from;
    return { range: { from: days({ from, to }) > MAX_DAYS ? addDays(to, -(MAX_DAYS - 1)) : from, to }, preset: "custom" };
  }
  return { range: { from: addDays(today, -29), to: today }, preset: "30" };
}
export const pctChange = (cur: number | null | undefined, prev: number | null | undefined) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

// ---- parsing (pure) ----
type Json = Record<string, unknown>;
const arr = (x: unknown): Json[] => (Array.isArray(x) ? (x as Json[]) : []);
const obj = (x: unknown): Json => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : {});
const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);

/** [ { type, value } ] -> { type: value }. */
export function metricMap(metrics: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of arr(metrics)) if (typeof m.type === "string" && typeof m.value === "number" && Number.isFinite(m.value)) out[m.type] = m.value;
  return out;
}

/** A sent post with its metrics. `interactions` is added here (reactions + comments + shares + saves + reposts) so posts can be ranked on one number. */
export function normalizePost(p: Json): Content {
  const s = metricMap(p.metrics), i = (s.reactions ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0) + (s.reposts ?? 0);
  return { id: String(p.id ?? Math.random()), url: str(p.externalLink), img: str(obj(arr(p.assets)[0]).thumbnail), text: str(p.text), at: str(p.sentAt) ?? str(p.dueAt), stats: { ...s, ...(Object.keys(s).length && { interactions: i }) } };
}
export const topBy = (items: Content[], key: string, n = 6) => [...items].sort((a, b) => (b.stats[key] ?? 0) - (a.stats[key] ?? 0)).slice(0, n);

// ---- fetching ----
// Answers are kept 5 minutes (Buffer's free plan allows 150 calls per 15 minutes and a report is a few calls per channel).
// ponytail: per-process memory (each serverless instance has its own); fine for a small team, move to Mongo/Redis if it ever matters.
const TTL = 5 * 60e3, cache = new Map<string, { at: number; data: unknown }>();

export async function gql<T>(query: string, ttl = TTL, key = bufferKey()): Promise<T> {
  if (!key) throw new BufferError("BUFFER_API_KEY is not set.");
  const ck = `${key}|${query}`, hit = ttl ? cache.get(ck) : undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  let r: Response;
  try { r = await fetch(base(), { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20_000), cache: "no-store" }); }
  catch { throw new BufferError("Could not reach Buffer (timeout or network)."); }
  if (r.status === 401) throw new BufferError("Buffer rejected the API key. Create a new one at publish.buffer.com/settings/api and update it (the organization's own key on Organizations, or BUFFER_API_KEY).");
  if (r.status === 429) throw new BufferError(`Buffer's request limit is reached. Try again in ${r.headers.get("retry-after") ?? "a few"} seconds.`);
  const j = (await r.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] };
  if (j.errors?.length) throw new BufferError(`Buffer: ${j.errors[0].message ?? "request failed"}`);
  if (!r.ok || !j.data) throw new BufferError(`Buffer answered ${r.status}.`);
  if (ttl) { if (cache.size > 200) cache.clear(); cache.set(ck, { at: Date.now(), data: j.data }); }
  return j.data;
}
const q = (s: string) => JSON.stringify(s); // GraphQL string literal; ids come from Buffer/our own database, never from a raw form field

/** Every channel in the key's Buffer account, across all its organizations. */
export async function listChannels(key = bufferKey()): Promise<Channel[]> {
  const { account } = await gql<{ account: { organizations: { id: string }[] } }>(`{ account { organizations { id } } }`, TTL, key);
  const per = await Promise.all(account.organizations.map(async (o) => {
    const { channels } = await gql<{ channels: Json[] }>(`{ channels(input: { organizationId: ${q(o.id)} }) { id name displayName service avatar externalLink isDisconnected isLocked } }`, TTL, key);
    return channels.map((c): Channel => ({ id: String(c.id), organizationId: o.id, name: String(c.name ?? c.id), displayName: str(c.displayName), service: String(c.service ?? ""), avatar: str(c.avatar), externalLink: str(c.externalLink), disconnected: c.isDisconnected === true, locked: c.isLocked === true }));
  }));
  return per.flat();
}

export type Report = {
  range: Range; prev: Range | null; // prev is null when it would start more than 2 years back (Buffer refuses that)
  totals: Sec<{ cur: Record<string, number>; prev: Record<string, number>; prevError?: string; updatedAt?: string }>;
  posts: Sec<Content[]>;
};
const sec = async <T,>(f: () => Promise<T>): Promise<Sec<T>> => {
  try { return { ok: true, data: await f() }; }
  catch (e) { return { ok: false, error: e instanceof BufferError ? e.message : "Unexpected answer from Buffer." }; }
};
const span = (r: Range) => `startDateTime: ${q(`${r.from}T00:00:00Z`)} endDateTime: ${q(`${r.to}T23:59:59Z`)}`;

export async function buildReport(l: Pick<Linked, "channelId" | "organizationId">, range: Range, today = todayIn(), key = bufferKey()): Promise<Report> {
  const prev = prevRange(range), prevOk = prev.from >= addDays(today, -729), org = q(l.organizationId), ch = `channelIds: [${q(l.channelId)}]`;
  const agg = (r: Range) => gql<{ m: { metrics: unknown; metricsUpdatedAt?: string } }>(`{ m: aggregatedPostMetrics(input: { organizationId: ${org} ${span(r)} ${ch} }) { metrics { type value } metricsUpdatedAt } }`, TTL, key).then((d) => d.m);
  const [totals, posts] = await Promise.all([
    sec(async () => {
      // two separate calls: a plan only keeps so much history (Free: 31 days), and the comparison period failing must not take the current numbers down with it
      const [cur, prv] = await Promise.all([agg(range), prevOk ? agg(prev).then((p) => ({ p }), (e) => ({ e: e instanceof BufferError ? e.message : "Could not load." })) : Promise.resolve({ p: undefined })]);
      return { cur: metricMap(cur?.metrics), prev: "p" in prv && prv.p ? metricMap(prv.p.metrics) : {}, prevError: "e" in prv ? prv.e : undefined, updatedAt: str(cur?.metricsUpdatedAt) };
    }),
    sec(async () => {
      const out: Content[] = [];
      let after = "";
      for (let page = 0; page < 4; page++) { // newest first; 4 pages x 50 = the 200 most recent posts of the period
        const d = await gql<{ posts: { edges?: { node: Json }[]; pageInfo: { endCursor?: string; hasNextPage: boolean } } }>(`{ posts(first: 50 ${after && `after: ${q(after)}`} input: { organizationId: ${org} filter: { ${ch} status: [sent] startDate: ${q(`${range.from}T00:00:00Z`)} endDate: ${q(`${range.to}T23:59:59Z`)} } sort: [{ field: dueAt direction: desc }] }) { edges { node { id text sentAt dueAt externalLink assets { thumbnail } metrics { type value } } } pageInfo { endCursor hasNextPage } } }`, TTL, key);
        out.push(...(d.posts.edges ?? []).map((e) => normalizePost(e.node)));
        if (!d.posts.pageInfo.hasNextPage || !d.posts.pageInfo.endCursor) break;
        after = d.posts.pageInfo.endCursor;
      }
      // Buffer's date filter is loose (it also matches on created/due date), so keep only posts actually sent inside the range
      return out.filter((c) => !c.at || (c.at.slice(0, 10) >= range.from && c.at.slice(0, 10) <= range.to));
    }),
  ]);
  return { range, prev: prevOk ? prev : null, totals, posts };
}

/** The report as flat rows (channel, section, item, date, metric, value) for the CSV export. */
export function reportRows(channel: string, r: Report): (string | number)[][] {
  const out: (string | number)[][] = [];
  if (r.totals.ok) for (const m of KPIS) { const c = r.totals.data.cur[m.key], p = r.totals.data.prev[m.key]; if (c !== undefined) out.push([channel, "summary", "", "", m.label, c], [channel, "summary", "", "", `${m.label} previous period`, p ?? ""]); }
  for (const c of r.posts.ok ? r.posts.data : []) for (const [k, v] of Object.entries(c.stats)) out.push([channel, "post", c.url ?? c.id, c.at?.slice(0, 10) ?? "", k, v]);
  return out;
}

// A text cell starting with = + - @ would run as a formula in Excel, so it gets a leading apostrophe. Real numbers (negatives included) are left alone.
const cell = (x: string | number) => {
  const s = String(x), t = typeof x === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const toCsv = (rows: (string | number)[][]) => ["channel,section,item,date,metric,value", ...rows.map((r) => r.map(cell).join(","))].join("\r\n");

// ---- planner: reading and scheduling posts (calendar + kanban) ----
// Times in the planner are India time (IST), like the rest of the dashboard.
// ponytail: one fixed timezone; add a per-user one if the team ever spreads across zones.
export type PostStatus = "draft" | "needs_approval" | "scheduled" | "sending" | "sent" | "error";
export type Planned = { id: string; channelId: string; status: PostStatus; text: string; dueAt?: string; img?: string; url?: string; error?: string; createdAt?: string };
export const IST = "Asia/Kolkata";
/** The calendar day (YYYY-MM-DD) an instant falls on in India. */
export const dayIn = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(iso));
export const timeIn = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** "2026-12-01" + "14:30" read as India time -> UTC ISO string, or null if either is invalid. */
export const istToUtc = (date: string, time: string) => { const d = ISO.test(date) && /^\d{2}:\d{2}$/.test(time) ? new Date(`${date}T${time}:00+05:30`) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

export function normalizePlanned(p: Json): Planned {
  return { id: String(p.id), channelId: String(p.channelId ?? ""), status: String(p.status ?? "draft") as PostStatus, text: typeof p.text === "string" ? p.text : "", dueAt: str(p.dueAt), img: str(obj(arr(p.assets)[0]).thumbnail), url: str(p.externalLink), error: str(obj(p.error).message), createdAt: str(p.createdAt) };
}

/** Posts of some channels, matching a raw GraphQL `filter` body (e.g. `status: [draft]`), up to 250. Cached 1 minute; every write below empties the cache. */
export async function listPosts(organizationId: string, channelIds: string[], filter: string, key = bufferKey()): Promise<Planned[]> {
  if (!channelIds.length) return [];
  const out: Planned[] = [];
  let after = "";
  for (let page = 0; page < 5; page++) {
    const d = await gql<{ posts: { edges?: { node: Json }[]; pageInfo: { endCursor?: string; hasNextPage: boolean } } }>(`{ posts(first: 50 ${after && `after: ${q(after)}`} input: { organizationId: ${q(organizationId)} filter: { channelIds: [${channelIds.map(q).join(",")}] ${filter} } sort: [{ field: dueAt direction: asc }] }) { edges { node { id channelId status text dueAt createdAt externalLink assets { thumbnail } error { message } } } pageInfo { endCursor hasNextPage } } }`, 60e3, key);
    out.push(...(d.posts.edges ?? []).map((e) => normalizePlanned(e.node)));
    if (!d.posts.pageInfo.hasNextPage || !d.posts.pageInfo.endCursor) break;
    after = d.posts.pageInfo.endCursor;
  }
  return out;
}
/** One post's channel and status (used to check a post belongs to a channel we link before changing it). */
export async function getPost(id: string, key = bufferKey()): Promise<Planned> {
  return normalizePlanned((await gql<{ post: Json }>(`{ post(input: { id: ${q(id)} }) { id channelId status text dueAt } }`, 0, key)).post);
}

export type Media = { url: string; kind?: "image" | "video" };
export type NewPost = {
  channelId: string; service: string; text: string; mode: "schedule" | "queue" | "draft"; dueAt?: string; igType?: "post" | "reel" | "story"; notify?: boolean;
  media?: Media[]; // in order; two or more on a feed post make a carousel
  coverMs?: number; // reels: the moment of the video shown as its cover (Buffer takes a frame, never an image of your own)
  coverUrl?: string; // reels sent as a reminder: an image the person publishing sets by hand in Instagram
};
/** Video or image: the uploader's own file type when known (UploadThing links have no extension), else guessed from the link. */
export const kindOf = (url: string, kind?: "image" | "video") => kind ?? (VIDEO.test(url) ? "video" : "image");
const VIDEO = /\.(mp4|mov|webm)(\?|$)/i, IG_LIMIT = 2196; // Instagram caption limit per Buffer's character-limits guide
export const MAX_MEDIA = 10; // Instagram's carousel limit
const HTTPS = /^https:\/\/\S+$/;
const isReel = (p: NewPost) => p.service === "instagram" && p.igType === "reel";

/** Returns what is wrong with a new post (shown to the person), or null. */
export function checkNewPost(p: NewPost, now = Date.now()): string | null {
  const media = p.media ?? [];
  if (!p.channelId) return "Pick a channel.";
  if (media.some((m) => !HTTPS.test(m.url))) return "Every media link must be a public https address.";
  if (media.length > MAX_MEDIA) return `A post can have at most ${MAX_MEDIA} images or videos.`;
  if (p.service === "instagram" && !media.length) return "Instagram posts need an image or video.";
  if (isReel(p) && (media.length !== 1 || kindOf(media[0].url, media[0].kind) !== "video")) return "A reel needs exactly one video.";
  if (p.service === "instagram" && p.igType === "story" && media.length !== 1) return "A story takes exactly one image or video.";
  if (!p.text.trim() && !media.length) return "Write a caption or add media.";
  if (p.service === "instagram" && p.text.length > IG_LIMIT) return `Instagram captions can be at most ${IG_LIMIT} characters (this one is ${p.text.length}).`;
  if (isReel(p) && p.coverUrl && !HTTPS.test(p.coverUrl)) return "The cover image link must be a public https address.";
  if (isReel(p) && p.coverUrl && !p.notify) return "An uploaded cover image can't be published automatically. Tick the reminder option, or remove the image and pick a frame.";
  if (p.mode === "schedule" && (!p.dueAt || Date.parse(p.dueAt) < now + 60_000)) return "Pick a date and time in the future.";
  return null;
}
const result = `{ ... on PostActionSuccess { post { id } } ... on MutationError { message } }`;
export function createPostBody(p: NewPost): string {
  const reel = isReel(p), offset = reel && Number.isInteger(p.coverMs) && p.coverMs! >= 0 ? p.coverMs : undefined;
  const assets = (p.media ?? []).map((m) => { const k = kindOf(m.url, m.kind); return `{ ${k}: { url: ${q(m.url)}${k === "video" && offset !== undefined ? ` metadata: { thumbnailOffset: ${offset} }` : ""} } }`; });
  // a reminder post shows these fields to whoever publishes it, so that is where the cover image's link goes
  const cover = reel && p.notify && p.coverUrl ? ` stickerFields: { other: ${q(`Cover image: ${p.coverUrl}`)} }` : "";
  return `createPost(input: { channelId: ${q(p.channelId)} text: ${q(p.text)} schedulingType: ${p.notify ? "notification" : "automatic"} mode: ${p.dueAt ? "customScheduled" : "addToQueue"}${p.dueAt ? ` dueAt: ${q(p.dueAt)}` : ""}${p.mode === "draft" ? " saveToDraft: true" : ""}${assets.length ? ` assets: [${assets.join(" ")}]` : ""}${p.service === "instagram" ? ` metadata: { instagram: { type: ${p.igType ?? "post"} shouldShareToFeed: true${cover} } }` : ""} }) ${result}`;
}
export const moveBody = (id: string, to: "draft" | "scheduled", dueAt?: string) => `editPost(input: { id: ${q(id)} ${to === "draft" ? "saveToDraft: true" : `mode: customScheduled dueAt: ${q(dueAt ?? "")} saveToDraft: false`} }) ${result}`;
export const rescheduleBody = (id: string, dueAt: string) => `editPost(input: { id: ${q(id)} mode: customScheduled dueAt: ${q(dueAt)} }) ${result}`;
export const deleteBody = (id: string) => `deletePost(input: { id: ${q(id)} }) { ... on DeletePostSuccess { id } ... on MutationError { message } }`;

/** Runs one mutation (never cached; the cache is emptied so the lists show the change) and turns Buffer's error members into a thrown message. */
export async function mutate(body: string, key = bufferKey()): Promise<string | undefined> {
  const d = await gql<Record<string, Json>>(`mutation { ${body} }`, 0, key);
  cache.clear();
  const r = obj(Object.values(d)[0]);
  if (typeof r.message === "string") throw new BufferError(`Buffer: ${r.message}`);
  return str(obj(r.post).id) ?? str(r.id);
}

// ---- calendar maths (Monday-first month grid) ----
/** The days a month view shows: from the Monday on/before the 1st to the Sunday on/after the last day. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`, wd = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const last = addDays(`${month}-${String(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate()).padStart(2, "0")}`, 0);
  const start = addDays(first, -wd), end = addDays(last, 6 - ((new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: days({ from: start, to: end }) }, (_, i) => addDays(start, i));
}
export const shiftMonth = (month: string, n: number) => { const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
