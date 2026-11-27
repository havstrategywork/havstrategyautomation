import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listChannels, BufferError, type Channel } from "@/lib/buffer";
import { keyFor } from "@/lib/bufferKeys";
import { cfg, missingEnv } from "@/lib/meta";
import { seal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, ago } from "@/components/ui";
import { Empty, SocialHead } from "@/components/social";
import Select from "@/components/mui/Select";

export const dynamic = "force-dynamic";

// Every action re-checks the role: the proxy already blocks the page, but a server action must never trust that alone.
async function admin() {
  if ((await currentUser())?.role !== "admin") redirect("/login");
}
const done = (msg: string) => redirect(`/social/orgs?m=${encodeURIComponent(msg)}`);
const oid = (f: FormData) => { const v = String(f.get("id") ?? ""); return ObjectId.isValid(v) ? new ObjectId(v) : null; };
const why = (e: unknown) => (e instanceof BufferError ? e.message : "Could not reach Buffer.");
/** The channels a key can see, or why they can't be listed. */
async function channelsOf(key: string): Promise<{ channels: Channel[]; error: string }> {
  if (!key) return { channels: [], error: "No usable Buffer API key." };
  try { return { channels: await listChannels(key), error: "" }; } catch (e) { return { channels: [], error: why(e) }; }
}

async function addOrg(f: FormData) {
  "use server";
  await admin();
  const name = String(f.get("name") ?? "").trim().slice(0, 80);
  if (!name) return done("Give the organization a name.");
  const { orgs } = await db();
  if (await orgs.findOne({ name })) return done(`"${name}" already exists.`);
  await orgs.insertOne({ name, createdAt: new Date() });
  revalidatePath("/social/orgs"); done(`Added ${name}. Now connect its Instagram accounts.`);
}

async function removeOrg(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { orgs, botConnections } = await db();
  if (!id) return done("No such organization.");
  if (await botConnections.countDocuments({ orgId: id })) return done("Disconnect this organization's Instagram accounts first.");
  await orgs.deleteOne({ _id: id });
  revalidatePath("/social/orgs"); done("Organization deleted.");
}

// The channel's details are looked up from Buffer again, never taken from the form, so a forged request can only link a channel the API key can really see.
async function linkChannel(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), channelId = String(f.get("channel") ?? ""), { orgs } = await db();
  if (!id || !channelId) return done("Pick a channel to link.");
  const org = await orgs.findOne({ _id: id });
  if (!org) return done("No such organization.");
  const seen = await channelsOf(keyFor(org));
  if (seen.error) return done(seen.error);
  const ch = seen.channels.find((c) => c.id === channelId);
  if (!ch) return done("Buffer does not list that channel.");
  if (await orgs.findOne({ "buffer.channelId": ch.id })) return done(`${ch.name} is already linked to an organization.`);
  await orgs.updateOne({ _id: id }, { $push: { buffer: { channelId: ch.id, organizationId: ch.organizationId, name: ch.displayName || ch.name, service: ch.service, ...(ch.avatar && { avatar: ch.avatar }) } } });
  revalidatePath("/social/orgs"); done(`Linked ${ch.name}.`);
}

async function unlinkChannel(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { orgs } = await db();
  if (!id) return done("No such organization.");
  await orgs.updateOne({ _id: id }, { $pull: { buffer: { channelId: String(f.get("channel") ?? "") } } });
  revalidatePath("/social/orgs"); done("Channel unlinked.");
}

// The key is checked against Buffer before it is saved, stored encrypted, and never shown again (messages travel in the address bar, so none include it).
async function saveKey(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), key = String(f.get("key") ?? "").trim(), { orgs } = await db(), org = id ? await orgs.findOne({ _id: id }) : null;
  if (!org) return done("No such organization.");
  if (!/^[\x21-\x7e]{8,500}$/.test(key)) return done("Paste the Buffer API key (no spaces).");
  const seen = await channelsOf(key);
  if (seen.error) return done(`The key was not saved. ${seen.error}`);
  const lost = (org.buffer ?? []).filter((b) => !seen.channels.some((c) => c.id === b.channelId));
  if (lost.length) return done(`The key was not saved: it can't see ${lost.map((b) => b.name).join(", ")}. Unlink ${lost.length === 1 ? "that channel" : "those channels"} first.`);
  await orgs.updateOne({ _id: org._id }, { $set: { bufferKey: seal(key) } });
  revalidatePath("/social/orgs"); done(`Saved ${org.name}'s Buffer key. It can see ${seen.channels.length} channel${seen.channels.length === 1 ? "" : "s"}.`);
}

async function removeKey(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { orgs } = await db(), org = id ? await orgs.findOne({ _id: id }) : null;
  if (!org) return done("No such organization.");
  if (org.buffer?.length) return done("Unlink this organization's channels first, then remove its key.");
  await orgs.updateOne({ _id: org._id }, { $unset: { bufferKey: "" } });
  revalidatePath("/social/orgs"); done(`Removed ${org.name}'s own key. It now uses the shared one.`);
}

async function disconnect(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { botConnections, botFlows, botSessions } = await db(), c = id ? await botConnections.findOne({ _id: id }) : null;
  if (!c) return done("No such connection.");
  const gone = await botFlows.deleteMany({ igId: c.igId }); // its flows go with it: they cannot run without the account
  await botSessions.deleteMany({ _id: new RegExp(`^${c.igId.replace(/\D/g, "")}:`) });
  await botConnections.deleteOne({ _id: id! });
  revalidatePath("/social/orgs"); done(`Disconnected @${c.username ?? c.igId}${gone.deletedCount ? ` and deleted its ${gone.deletedCount} flow${gone.deletedCount === 1 ? "" : "s"}` : ""}. To revoke access fully, remove the app in the client's Instagram settings.`);
}

export default async function Orgs({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { orgs, botConnections } = await db();
  const [list, conns] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), botConnections.find().sort({ username: 1 }).toArray()]);
  const missing = missingEnv(), app = cfg().app || "<APP_URL>";
  // organizations without their own key share one listing; the shared key's problem is only worth a banner if somebody relies on it
  const usesShared = !list.length || list.some((o) => !o.bufferKey);
  const shared = usesShared ? await channelsOf(keyFor(null)) : { channels: [], error: "" };
  const seen = new Map(await Promise.all(list.map(async (o) => [String(o._id), o.bufferKey ? await channelsOf(keyFor(o)) : shared] as const)));
  const sharedError = usesShared && shared.error ? (keyFor(null) ? shared.error : "BUFFER_API_KEY is not set in the environment. Create a key at publish.buffer.com/settings/api, or give an organization its own key below.") : "";
  const taken = new Set(list.flatMap((o) => (o.buffer ?? []).map((b) => b.channelId)));

  return (
    <>
      <SocialHead
        icon="layers" title="Organizations"
        sub="Each organization is one client. Link its Buffer channels for the Planner and Reports; connect Instagram through Meta only if you use the Chat bots."
        actions={
          <form action={addOrg} className="inline-form">
            <input name="name" required maxLength={80} autoComplete="off" placeholder="New client or brand name" aria-label="Organization name" />
            <button><Icon name="plus" size={16} /> Add organization</button>
          </form>
        }
      />
      {m && <div className="notice" role="status">{m}</div>}
      {sharedError && <div className="notice warn"><b>The shared Buffer key is not working.</b> {sharedError}</div>}
      {missing.length > 0 && (
        <details className="notice warn setup">
          <summary><b>The Meta app (Chat bots only) is not set up yet.</b> Missing: {missing.join(", ")}. <span className="muted">Show setup steps</span></summary>
          <div className="small">In the Meta app: use case &quot;Manage messaging &amp; content on Instagram&quot; with Unified login. In the login configuration include the permissions <code>instagram_business_basic</code> and <code>instagram_business_manage_messages</code> (Meta&apos;s current names; older apps may show them without &quot;business_&quot;). Redirect URL <code>{app}/api/meta/callback</code>. Webhook callback URL <code>{app}/api/meta/webhook</code> with the same verify token as META_VERIFY_TOKEN, subscribed to <code>messages</code> and <code>messaging_postbacks</code>. META_CONFIG_ID is the login configuration&apos;s id.</div>
        </details>
      )}

      {!list.length ? <Empty icon="layers" title="No organizations yet">Add your first client with the field above.</Empty> : (
        <div className="grid">
          {list.map((o) => {
            const mine = conns.filter((c) => String(c.orgId) === String(o._id)), linkedCh = o.buffer ?? [];
            const { channels, error } = seen.get(String(o._id))!, free = channels.filter((c) => !taken.has(c.id) && !c.locked);
            return (
              <section key={String(o._id)} className="card org-admin">
                <div className="org-admin-head">
                  <div className="who"><Avatar name={o.name} large /><div className="two"><b>{o.name}</b><small>{linkedCh.length} Buffer channel{linkedCh.length === 1 ? "" : "s"} · {mine.length} Instagram account{mine.length === 1 ? "" : "s"}</small></div></div>
                  <form action={removeOrg}><input type="hidden" name="id" value={String(o._id)} /><button className="ghost small-btn danger-txt" title={mine.length ? "Disconnect its Instagram accounts first" : "Delete this organization"}><Icon name="trash" size={14} /> Delete</button></form>
                </div>

                <div className="org-split">
                  <div className="panel">
                    <div className="panel-head"><span className="ico info"><Icon name="link" /></span><div className="two"><b>Buffer channels</b><small>Used by Planner and Reports</small></div></div>
                    {linkedCh.length > 0 ? (
                      <ul className="feed">
                        {linkedCh.map((b) => (
                          <li key={b.channelId}>
                            <Avatar name={b.name} />
                            <div className="two"><b>{b.name}</b><small>{b.service}</small></div>
                            <form action={unlinkChannel} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={String(o._id)} /><input type="hidden" name="channel" value={b.channelId} /><button className="ghost small-btn danger-txt">Unlink</button></form>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="panel-empty">No channels linked yet.</p>}
                    {free.length > 0 && (
                      <form action={linkChannel} className="inline-form">
                        <input type="hidden" name="id" value={String(o._id)} />
                        <Select name="channel" ariaLabel="Buffer channel to link" options={[{ value: "", label: "Pick a Buffer channel…" }, ...free.map((c) => ({ value: c.id, label: `${c.displayName || c.name} (${c.service})${c.disconnected ? " - disconnected in Buffer" : ""}` }))]} />
                        <button className="small-btn">Link</button>
                      </form>
                    )}
                    {o.bufferKey && error && <p className="small bad-txt">This organization&apos;s Buffer key has a problem: {error}</p>}
                    <form action={saveKey} className="inline-form">
                      <input type="hidden" name="id" value={String(o._id)} />
                      <input type="password" name="key" required maxLength={500} autoComplete="new-password" placeholder={o.bufferKey ? "Paste a new key to replace it" : "Client's own Buffer API key (optional)"} aria-label={`Buffer API key for ${o.name}`} />
                      <button className="ghost small-btn">Save key</button>
                    </form>
                    {o.bufferKey
                      ? <form action={removeKey} className="inline-form"><input type="hidden" name="id" value={String(o._id)} /><small className="muted">Uses its own Buffer key (saved, encrypted).</small><button className="ghost small-btn danger-txt">Remove key</button></form>
                      : <small className="muted">Uses the shared Buffer account.</small>}
                  </div>

                  <div className="panel">
                    <div className="panel-head"><span className="ico violet"><Icon name="camera" /></span><div className="two"><b>Instagram via Meta</b><small>Used by Chat bots only</small></div></div>
                    {mine.length ? (
                      <ul className="feed">
                        {mine.map((c) => (
                          <li key={String(c._id)}>
                            <Avatar name={c.username ?? c.igId} />
                            <div className="two" style={{ minWidth: 0 }}><b>@{c.username ?? c.igId}</b><small>connected {ago(c.connectedAt)}{c.test ? " · TEST connection (no Meta, nothing is sent)" : c.subscribed === false ? " · webhook not subscribed" : ""}</small>{c.lastError && <small className="bad-txt">Last problem ({ago(c.lastError.at)}): {c.lastError.message}</small>}</div>
                            <form action={disconnect} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={String(c._id)} /><button className="ghost small-btn danger-txt">Disconnect</button></form>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="panel-empty">None yet. Connect one and have the client approve their account.</p>}
                    <a className="btn ghost small-btn" href={`/social/connect/start?org=${o._id}`} style={{ alignSelf: "flex-start" }}><Icon name="plug" size={14} /> Connect Instagram</a>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
