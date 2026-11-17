import Link from "next/link";
import { ObjectId } from "mongodb";
import { notFound } from "next/navigation";
import { cleanMoney } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { STATUSES, tierOf } from "@/lib/fields";
import { Avatar, Badge, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function Creator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { creators, outreach, clients } = await db();
  const c = ObjectId.isValid(id) ? await creators.findOne({ _id: new ObjectId(id) }) : null;
  if (!c) notFound();
  const [history, clientList] = await Promise.all([outreach.find({ creatorId: c._id }).sort({ createdAt: -1 }).toArray(), clients.find().toArray()]);
  const suggested = new Set((c.suggestedVia ?? []).map(String));

  async function save(f: FormData) {
    "use server";
    const { creators } = await db();
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const set: Record<string, unknown> = {}, unset: Record<string, ""> = {};
    // empty optional field = remove it, so nothing is ever stored as null
    const opt = (k: string, v: unknown) => (v === undefined || v === "" || (typeof v === "number" && isNaN(v)) ? (unset[k] = "") : (set[k] = v));
    set.name = s("name") || c!.igHandle;
    set.niches = s("niches").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    set.followers = Number(s("followers")) || 0;
    set.status = (STATUSES as readonly string[]).includes(s("status")) ? s("status") : "New";
    set.suggestedVia = f.getAll("suggestedVia").map((i) => new ObjectId(String(i)));
    set.notes = s("notes");
    set.collab = { count: Number(s("collabCount")) || 0, rating: Number(s("collabRating")) || 0, notes: s("collabNotes") };
    for (const k of ["igCategory", "location", "phone", "contactSource", "response", "outreachNotes"]) opt(k, s(k));
    opt("email", s("email").toLowerCase());
    opt("engagementRate", s("engagementRate") === "" ? "" : Number(s("engagementRate")));
    for (const k of ["quotedRate", "agreedRate"]) opt(k, s(k) === "" ? "" : cleanMoney(s(k), k));
    for (const k of ["dmSentAt", "lastChecked", "followUpSentAt"]) opt(k, s(k) ? new Date(s(k)) : "");
    await creators.updateOne({ _id: new ObjectId(id) }, { $set: set, ...(Object.keys(unset).length && { $unset: unset }) });
    revalidatePath(`/creators/${id}`);
  }

  return (
    <>
      <p className="small"><Link href="/creators">← All creators</Link></p>
      <div className="card row" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <Avatar name={c.name} large />
        <div style={{ flex: 1 }}>
          <h1>{c.name}</h1>
          <div className="row small" style={{ marginTop: ".25rem" }}>
            {c.igHandle && <a href={`https://instagram.com/${c.igHandle}`} target="_blank">@{c.igHandle} ↗</a>}
            <span className="muted">{c.followers ? `${c.followers.toLocaleString()} followers` : "followers unknown"}</span>
            <span className="muted">· last checked {ago(c.lastChecked)}</span>
          </div>
        </div>
        <div className="row"><Badge s="tier">{tierOf(c.followers)}</Badge><Badge s={c.status ?? "New"} /><span className="chip soft">Suggested to {suggested.size} client{suggested.size === 1 ? "" : "s"}</span></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", alignItems: "start" }}>
        <form action={save} className="form">
          <div className="card form">
            <h3>Profile</h3>
            <div className="f2">
              <label>Name<input name="name" defaultValue={c.name} /></label>
              <label>Followers<input name="followers" type="number" defaultValue={c.followers} /></label>
              <label>IG category<input name="igCategory" defaultValue={c.igCategory} /></label>
              <label>Location (per bio)<input name="location" defaultValue={c.location} /></label>
            </div>
            <label>Notes (from bio)<textarea name="notes" rows={3} defaultValue={c.notes} /></label>
          </div>

          <div className="card form">
            <h3>Contact</h3>
            <div className="f2">
              <label>Public email<input name="email" defaultValue={c.email ?? ""} /></label>
              <label>Phone / WhatsApp<input name="phone" defaultValue={c.phone} /></label>
              <label>Contact source<input name="contactSource" defaultValue={c.contactSource} placeholder="IG bio, Linktree, website…" /></label>
            </div>
          </div>

          <div className="card form">
            <h3>Outreach &amp; deal</h3>
            <div className="f2">
              <label>Status<select name="status" defaultValue={c.status ?? "New"}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>DM sent<input name="dmSentAt" type="date" defaultValue={day(c.dmSentAt)} /></label>
              <label>Follow-up sent<input name="followUpSentAt" type="date" defaultValue={day(c.followUpSentAt)} /></label>
              <label>Last checked<input name="lastChecked" type="date" defaultValue={day(c.lastChecked)} /></label>
              <label>Quoted rate (amount + currency)<input name="quotedRate" placeholder="10k INR" defaultValue={c.quotedRate} /></label>
              <label>Agreed rate (amount + currency)<input name="agreedRate" placeholder="10k INR" defaultValue={c.agreedRate} /></label>
            </div>
            <label>Response<textarea name="response" rows={2} defaultValue={c.response} /></label>
            <label>Outreach notes<textarea name="outreachNotes" rows={3} defaultValue={c.outreachNotes} /></label>
            <fieldset><legend>Suggested via (clients)</legend>
              {clientList.length ? clientList.map((cl) => <label key={String(cl._id)}><span><input type="checkbox" name="suggestedVia" value={String(cl._id)} defaultChecked={suggested.has(String(cl._id))} /> {cl.name}</span></label>) : <span className="muted small">No clients yet</span>}
            </fieldset>
          </div>

          <div className="card form">
            <h3>Scoring inputs</h3>
            <div className="f2">
              <label>Niches (comma separated)<input name="niches" defaultValue={c.niches.join(", ")} /></label>
              <label>Engagement %<input name="engagementRate" type="number" step="0.1" defaultValue={c.engagementRate} /></label>
              <label>Past collabs (count)<input name="collabCount" type="number" defaultValue={c.collab.count} /></label>
              <label>Past collab rating (0–5)<input name="collabRating" type="number" step="0.5" max={5} defaultValue={c.collab.rating} /></label>
            </div>
            <label>Past collab notes<textarea name="collabNotes" rows={3} defaultValue={c.collab.notes} /></label>
          </div>
          <div className="savebar"><button>Save changes</button></div>
        </form>

        <aside className="card">
          <h3>Outreach history</h3>
          {history.length ? (
            <div className="hist">{history.map((o) => (
              <div key={String(o._id)}>
                <div className="row"><Badge s={o.channel}>{o.channel === "ig" ? "IG" : "Email"}</Badge><Badge s={o.status} /><span className="muted small">{ago(o.sentAt ?? o.createdAt)}</span></div>
                <details><summary className="small">Message</summary><div className="small">{o.message}</div></details>
                {o.error && <div className="small" style={{ color: "var(--bad)" }}>{o.error}</div>}
              </div>
            ))}</div>
          ) : <div className="empty small">No outreach yet.</div>}
        </aside>
      </div>
      <style>{`@media (max-width: 1000px) { .grid[style*="320px"] { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
