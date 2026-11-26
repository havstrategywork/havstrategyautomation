import Link from "next/link";
import { db } from "@/lib/db";
import { bufferKey, BufferError, dayIn, listPosts, monthGrid, shiftMonth, timeIn, todayIn, type Linked, type Planned } from "@/lib/buffer";
import { currentUser } from "@/lib/session";
import { Avatar, Icon } from "@/components/ui";
import { Empty, OrgTabs, Seg, SocialHead } from "@/components/social";
import PlannerBoard, { type PlannerCard, type PlannerColumn } from "@/components/PlannerBoard";
import PlannerComposer, { NewPostButton } from "@/components/PlannerComposer";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Draft", needs_approval: "Needs approval", scheduled: "Scheduled", sending: "Sending", sent: "Sent", error: "Failed" };
const LEGEND = [["scheduled", "Scheduled"], ["draft", "Drafts"], ["needs_approval", "Needs approval"], ["error", "Failed"], ["sent", "Sent"]] as const;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PER_DAY = 3; // calendar chips shown per day before "+N more"
const utc = (day: string, end = false) => `${day}T${end ? "23:59:59" : "00:00:00"}+05:30`; // a calendar day in India time

/** Posts of every linked channel, one Buffer call per Buffer organization (channels of one org are asked together). */
async function fetchAll(channels: Linked[], filter: string): Promise<Planned[]> {
  const byOrg = new Map<string, string[]>();
  for (const c of channels) byOrg.set(c.organizationId, [...(byOrg.get(c.organizationId) ?? []), c.channelId]);
  return (await Promise.all([...byOrg].map(([org, ids]) => listPosts(org, ids, filter)))).flat();
}

export default async function Planner({ searchParams }: { searchParams: Promise<{ org?: string; view?: string; m?: string }> }) {
  const sp = await searchParams, view = sp.view === "kanban" ? "kanban" : "calendar", today = todayIn();
  const { orgs } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const channels: Linked[] = org?.buffer ?? [], name = new Map(channels.map((c) => [c.channelId, c]));
  const month = sp.m && MONTH.test(sp.m) ? sp.m : today.slice(0, 7), grid = monthGrid(month);
  const qs = (extra: Record<string, string>) => `/social/planner?${new URLSearchParams({ org: String(org?._id ?? ""), view, ...(view === "calendar" && { m: month }), ...extra })}`;
  const ready = !!org && channels.length > 0 && !!bufferKey();

  let posts: Planned[] = [], sent: Planned[] = [], error = "";
  if (ready) {
    try {
      if (view === "calendar") posts = await fetchAll(channels, `dueAt: { start: "${new Date(utc(grid[0])).toISOString()}" end: "${new Date(utc(grid.at(-1)!, true)).toISOString()}" }`);
      else [posts, sent] = await Promise.all([fetchAll(channels, "status: [draft, needs_approval, scheduled, sending, error]"), fetchAll(channels, `status: [sent] dueAt: { start: "${new Date(Date.now() - 14 * 864e5).toISOString()}" }`)]);
    } catch (e) { error = e instanceof BufferError ? e.message : "Could not load posts from Buffer."; }
  }

  const card = (p: Planned): PlannerCard => ({ id: p.id, channel: name.get(p.channelId)?.name ?? "", service: name.get(p.channelId)?.service ?? "", text: p.text, img: p.img, status: p.status, error: p.error, url: p.url, when: p.dueAt ? `${new Date(p.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${timeIn(p.dueAt)}` : undefined, date: p.dueAt ? dayIn(p.dueAt) : undefined, time: p.dueAt ? timeIn(p.dueAt) : undefined });
  const columns: PlannerColumn[] = [
    { key: "draft", title: "Drafts", hint: "Not scheduled yet", drop: "draft", cards: posts.filter((p) => p.status === "draft").map(card) },
    { key: "needs_approval", title: "Needs approval", hint: "Waiting for sign-off in Buffer", cards: posts.filter((p) => p.status === "needs_approval").map(card) },
    { key: "scheduled", title: "Scheduled", hint: "Goes out at its time", drop: "scheduled", cards: posts.filter((p) => p.status === "scheduled" || p.status === "sending").map(card) },
    { key: "sent", title: "Sent", hint: "Last 14 days", cards: [...sent].reverse().map(card) },
    { key: "error", title: "Failed", hint: "Buffer could not publish these", cards: posts.filter((p) => p.status === "error").map(card) },
  ];
  // the calendar counts only the visible month (its grid also shows a few days of the months around it)
  const all = view === "calendar" ? posts.filter((p) => p.dueAt && dayIn(p.dueAt).startsWith(month)) : [...posts, ...sent];
  const count = (s: string) => all.filter((p) => p.status === s || (s === "scheduled" && p.status === "sending")).length;
  const byDay = new Map<string, Planned[]>();
  for (const p of posts) if (p.dueAt) { const d = dayIn(p.dueAt); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
  for (const v of byDay.values()) v.sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const title = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const chip = (p: Planned) => (
    <div key={p.id} className={`ev s-${p.status}`} title={`${STATUS[p.status]} · ${name.get(p.channelId)?.name ?? ""} · ${timeIn(p.dueAt!)}\n${p.text}${p.error ? `\n${p.error}` : ""}`}>
      <Avatar name={name.get(p.channelId)?.name ?? "?"} /><b>{timeIn(p.dueAt!)}</b><span>{p.text || "(media)"}</span>
    </div>
  );

  return (
    <>
      <SocialHead
        icon="calendar" title="Planner"
        sub={org ? <>Plan, schedule and track posts for <b>{org.name}</b>. Times are India time.</> : "Plan and schedule posts to your Buffer channels."}
        actions={ready && <NewPostButton><Icon name="plus" size={16} /> New post</NewPostButton>}
      >
        {list.length > 0 && <OrgTabs orgs={list} current={String(org._id)} href={(id) => `/social/planner?${new URLSearchParams({ org: id, view })}`} />}
        {list.length > 0 && <Seg label="View" items={[{ href: qs({ view: "calendar" }), text: "Calendar", icon: "calendar", on: view === "calendar" }, { href: qs({ view: "kanban" }), text: "Board", icon: "columns", on: view === "kanban" }]} />}
      </SocialHead>

      {!bufferKey() && <div className="notice warn"><b>Buffer is not connected.</b> Set BUFFER_API_KEY in the environment.</div>}
      {error && <div className="notice bad">{error}</div>}

      {!list.length ? <Empty icon="layers" title="No organizations yet">{me?.role === "admin" ? <><Link href="/social/orgs">Add one</Link> and link its Buffer channels to start planning.</> : "Ask an admin to add one."}</Empty>
      : !channels.length ? <Empty icon="link" title={`${org.name} has no Buffer channels yet`}>{me?.role === "admin" ? <>Link them on the <Link href="/social/orgs">Organizations</Link> page.</> : "Ask an admin to link them on the Organizations page."}</Empty>
      : (
        <>
          <PlannerComposer channels={channels.map((c) => ({ channelId: c.channelId, name: c.name, service: c.service }))} />

          <div className="statline">
            <span className="statline-label">{view === "calendar" ? title : "Open posts"}</span>
            {LEGEND.map(([s, l]) => <span key={s} className={`st s-${s}`}><i />{count(s)} <span>{l}</span></span>)}
            <span className="statline-ch">{channels.map((c) => <span key={c.channelId} title={`${c.name} (${c.service})`}><Avatar name={c.name} /></span>)}<small>{channels.length} channel{channels.length === 1 ? "" : "s"}</small></span>
          </div>

          {view === "kanban" ? <PlannerBoard columns={columns} /> : (
            <div className="card cal">
              <div className="cal-head">
                <h2>{title}</h2>
                <div className="cal-nav">
                  <Link className="btn ghost small-btn" href={qs({ m: shiftMonth(month, -1) })} aria-label="Previous month"><Icon name="left" size={16} /></Link>
                  <Link className="btn ghost small-btn" href={qs({ m: today.slice(0, 7) })}>Today</Link>
                  <Link className="btn ghost small-btn" href={qs({ m: shiftMonth(month, 1) })} aria-label="Next month"><Icon name="right" size={16} /></Link>
                </div>
              </div>
              <div className="cal-grid">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
                {grid.map((d) => {
                  const items = byDay.get(d) ?? [];
                  return (
                    <div key={d} className={`cal-day${d.slice(0, 7) !== month ? " other" : ""}${d === today ? " today" : ""}${d < today ? " past" : ""}`}>
                      <div className="cal-num"><span>{Number(d.slice(8))}</span>{d >= today && <NewPostButton date={d} />}</div>
                      {items.slice(0, PER_DAY).map(chip)}
                      {items.length > PER_DAY && <details className="cal-more"><summary>+{items.length - PER_DAY} more</summary>{items.slice(PER_DAY).map(chip)}</details>}
                    </div>
                  );
                })}
              </div>
              {!error && !all.length && <p className="cal-hint"><Icon name="spark" size={14} /> Nothing planned in {title}. Press <b>+</b> on a day or <b>New post</b> to add one.</p>}
              <p className="cal-foot small muted">Drafts without a date only show on the Board view.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
