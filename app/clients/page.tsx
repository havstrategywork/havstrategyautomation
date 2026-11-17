import { revalidatePath } from "next/cache";
import Link from "next/link";
import { db } from "@/lib/db";
import { TIERS } from "@/lib/fields";
import { cleanMoney } from "@/lib/money";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

const split = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

async function add(f: FormData) {
  "use server";
  const n = (k: string, d: number) => Number(f.get(k)) || d;
  await (await db()).clients.insertOne({
    name: String(f.get("name")),
    niches: split(f.get("niches")), related: split(f.get("related")), locations: split(f.get("locations")),
    ...(String(f.get("budget")).trim() && { maxRate: cleanMoney(f.get("budget"), "budget") }),
    minFollowers: n("min", 0), maxFollowers: n("max", 1e9), notes: String(f.get("notes")), offer: String(f.get("offer") ?? ""), dmTemplate: String(f.get("dmTemplate") ?? ""), emailSubject: String(f.get("emailSubject") ?? ""),
    weights: { niche: n("wNiche", 3), followers: n("wFollowers", 2), engagement: n("wEngagement", 2), collab: n("wCollab", 1), location: n("wLocation", 2) },
  });
  revalidatePath("/clients");
}

const Chips = ({ items, soft }: { items?: string[]; soft?: boolean }) => items?.length ? <div className="chips">{items.map((i) => <span key={i} className={`chip${soft ? " soft" : ""}`}>{i}</span>)}</div> : <span className="muted">—</span>;
const compact = (n: number) => (n >= 1e9 ? "no limit" : n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n));

export default async function Clients() {
  const { clients, creators } = await db();
  const list = await clients.find().toArray();
  const counts = new Map((await creators.aggregate<{ _id: unknown; n: number }>([{ $unwind: "$suggestedVia" }, { $group: { _id: "$suggestedVia", n: { $sum: 1 } } }]).toArray()).map((r) => [String(r._id), r.n]));

  return (
    <>
      <PageHead title="Clients" sub="Each client is a requirement. Creators are scored against it." />
      <div className="grid cols">
        {list.map((c) => (
          <div className="card form" key={String(c._id)}>
            <div className="row spread"><h2 style={{ margin: 0 }}>{c.name}</h2><Link className="small" href={`/creators?clientId=${c._id}`}>Ranked creators →</Link></div>
            <div><h3>Niches</h3><Chips items={c.niches} /></div>
            <div className="f2">
              <div><h3>Related terms</h3><Chips items={c.related} soft /></div>
              <div><h3>Locations</h3><Chips items={c.locations} soft /></div>
            </div>
            <dl className="kv">
              <dt>Followers</dt><dd>{compact(c.minFollowers)} – {compact(c.maxFollowers)}</dd>
              <dt>Budget per creator</dt><dd>{c.maxRate || "—"}</dd>
              <dt>Weights (niche / followers / engagement / collab / location)</dt><dd>{[c.weights.niche, c.weights.followers, c.weights.engagement, c.weights.collab, c.weights.location ?? 2].join(" · ")}</dd>
              <dt>Creators suggested</dt><dd>{counts.get(String(c._id)) ?? 0}</dd>
            </dl>
            {c.notes && <p className="muted small" style={{ margin: 0 }}>{c.notes}</p>}
            <div><h3>Message template (sent word for word)</h3><p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.dmTemplate || <span className="muted">None. Claude writes its own first message.</span>}</p></div>
            <div><h3>Offer brief (what Claude answers from)</h3><p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.offer || <span className="muted">None yet. Claude has nothing to answer product or deal questions from, so it will escalate them.</span>}</p></div>
          </div>
        ))}
        {!list.length && <div className="card empty">No clients yet. Add one below, or give Claude a requirement.</div>}
      </div>

      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>Add a client requirement</summary>
        <form action={add} className="form" style={{ marginTop: ".9rem" }}>
          <div className="f2">
            <label>Name<input name="name" required /></label>
            <label>Target niches (comma separated)<input name="niches" placeholder="fitness, nutrition" /></label>
            <label>Related / adjacent terms<input name="related" placeholder="gym, workout, wellness" /></label>
            <label>Preferred locations<input name="locations" placeholder="dubai, uae" /></label>
            <label>Max rate per creator (amount + currency)<input name="budget" placeholder="20k INR" pattern=".*\d.*" /></label>
            <label>Min followers<input name="min" type="number" /></label>
            <label>Max followers<input name="max" type="number" /></label>
          </div>
          <fieldset><legend>Weights (higher = matters more; blank uses the default)</legend>
            <div className="f2" style={{ marginTop: ".4rem" }}>
              <label>Niche (3)<input name="wNiche" type="number" /></label><label>Followers (2)<input name="wFollowers" type="number" /></label>
              <label>Engagement (2)<input name="wEngagement" type="number" /></label><label>Collab (1)<input name="wCollab" type="number" /></label>
              <label>Location (2)<input name="wLocation" type="number" /></label>
            </div>
          </fieldset>
          <label>Notes / brief<textarea name="notes" rows={3} /></label>
          <label>Message to send (use {"{{name}}"} where the creator's name goes)<textarea name="dmTemplate" rows={5} /></label>
          <label>Email subject (when the same text is emailed)<input name="emailSubject" /></label>
          <label>Offer brief for replies (product, deliverables, payment terms, what we cannot promise)<textarea name="offer" rows={4} /></label>
          <div><button>Add client</button></div>
        </form>
      </details>
    </>
  );
}
