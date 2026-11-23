import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listIgAccounts, MetricoolError } from "@/lib/metricool";
import { cfg, missingEnv } from "@/lib/meta";
import { seal, unseal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

// Every action re-checks the role: the proxy already blocks the page, but a server action must never trust that alone.
async function admin() {
  if ((await currentUser())?.role !== "admin") redirect("/login");
}
const done = (msg: string) => redirect(`/social/orgs?m=${encodeURIComponent(msg)}`);
const oid = (f: FormData) => { const v = String(f.get("id") ?? ""); return ObjectId.isValid(v) ? new ObjectId(v) : null; };
const creds = (f: FormData) => ({ userId: String(f.get("userId") ?? "").trim().slice(0, 40), token: String(f.get("token") ?? "").trim().slice(0, 300) });

async function addOrg(f: FormData) {
  "use server";
  await admin();
  const name = String(f.get("name") ?? "").trim().slice(0, 80), { userId, token } = creds(f);
  if (!name) return done("Give the organization a name.");
  if (!!userId !== !!token) return done("Enter both the Metricool user id and token, or leave both empty for now.");
  const { orgs } = await db();
  if (await orgs.findOne({ name })) return done(`"${name}" already exists.`);
  await orgs.insertOne({ name, createdAt: new Date(), ...(token && { metricool: { userId, token: seal(token) } }) });
  revalidatePath("/social/orgs"); done(`Added ${name}.${token ? " Now sync its accounts." : " Add its Metricool login when you have one."}`);
}

async function saveCreds(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { userId, token } = creds(f);
  if (!id || !userId || !token) return done("Enter both the Metricool user id and token.");
  await (await db()).orgs.updateOne({ _id: id }, { $set: { metricool: { userId, token: seal(token) } } });
  revalidatePath("/social/orgs"); done("Metricool login saved. Sync to import the accounts.");
}

async function sync(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { orgs, socialAccounts } = await db(), org = id ? await orgs.findOne({ _id: id }) : null;
  if (!org?.metricool) return done("Add the Metricool user id and token first.");
  let found;
  try { found = await listIgAccounts({ userId: org.metricool.userId, token: unseal(org.metricool.token) }); }
  catch (e) { return done(e instanceof MetricoolError ? e.message : "Could not read the saved token. Enter the Metricool login again."); }
  const now = new Date();
  if (found.length) await socialAccounts.bulkWrite(found.map((a) => ({ updateOne: { filter: { orgId: org._id!, blogId: a.blogId }, update: { $set: { ...a, syncedAt: now } }, upsert: true } }))); // the filter's orgId is filled in on insert
  const gone = await socialAccounts.deleteMany({ orgId: org._id!, blogId: { $nin: found.map((a) => a.blogId) } }); // accounts removed in Metricool disappear here too
  await orgs.updateOne({ _id: org._id }, { $set: { "metricool.syncedAt": now } });
  const msg = `${org.name}: ${found.length} Instagram account${found.length === 1 ? "" : "s"} synced${gone.deletedCount ? `, ${gone.deletedCount} removed` : ""}.`;
  revalidatePath("/social/orgs"); done(msg);
}

async function removeOrg(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { orgs, socialAccounts } = await db();
  if (!id) return done("No such organization.");
  await socialAccounts.deleteMany({ orgId: id }); await orgs.deleteOne({ _id: id });
  revalidatePath("/social/orgs"); done("Organization deleted.");
}

async function disconnect(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { botConnections, botFlows, botSessions } = await db(), c = id ? await botConnections.findOne({ _id: id }) : null;
  if (!c) return done("No such connection.");
  const gone = await botFlows.deleteMany({ igId: c.igId }); // its flows go with it: they cannot run without the account
  await botSessions.deleteMany({ _id: new RegExp(`^${c.igId.replace(/\D/g, "")}:`) }); await botConnections.deleteOne({ _id: id! });
  revalidatePath("/social/orgs"); done(`Disconnected @${c.username ?? c.igId}${gone.deletedCount ? ` and deleted its ${gone.deletedCount} flow${gone.deletedCount === 1 ? "" : "s"}` : ""}. To revoke access fully, remove the app in the client's Instagram settings.`);
}

export default async function Orgs({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { orgs, socialAccounts, botConnections } = await db();
  const [list, accounts, conns] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), socialAccounts.find().sort({ igHandle: 1 }).toArray(), botConnections.find().sort({ username: 1 }).toArray()]);
  const missing = missingEnv(), app = cfg().app || "<APP_URL>";

  return (
    <>
      <PageHead title="Organizations" sub="Each org is one Metricool account. Its Instagram accounts are imported from Metricool, and the social team picks from them in Reports and Chat bots." />
      {m && <div className="notice" role="status">{m}</div>}
      {missing.length > 0 && (
        <div className="notice" style={{ borderLeftColor: "var(--warn)" }}>
          <b>Chat bots need the Meta app set up.</b> Missing in the environment: {missing.join(", ")}.
          <div className="small muted" style={{ marginTop: ".35rem" }}>In the Meta app: use case &quot;Manage messaging &amp; content on Instagram&quot; with Unified login. Redirect URL <code>{app}/api/meta/callback</code>, webhook callback URL <code>{app}/api/meta/webhook</code> with the same verify token as META_VERIFY_TOKEN, and subscribe to the <code>messages</code> and <code>messaging_postbacks</code> fields. META_CONFIG_ID is the login configuration&apos;s id.</div>
        </div>
      )}

      <form action={addOrg} className="card form">
        <h2 style={{ margin: 0 }}>Add an organization</h2>
        <div className="f2">
          <label>Name<input name="name" required maxLength={80} autoComplete="off" /></label>
          <label>Metricool user id<input name="userId" inputMode="numeric" maxLength={40} autoComplete="off" placeholder="optional for now" /></label>
          <label>Metricool API token<input name="token" type="password" maxLength={300} autoComplete="off" placeholder="optional for now" /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Find both in Metricool under Account Settings, API (Advanced or Custom plan). The token is stored encrypted and never shown again.</p>
        <div><button>Add organization</button></div>
      </form>

      <div className="grid" style={{ marginTop: "1rem" }}>
        {list.map((o) => {
          const mine = accounts.filter((a) => String(a.orgId) === String(o._id));
          return (
            <div key={String(o._id)} className="card">
              <div className="row spread">
                <div className="who"><Avatar name={o.name} /><div className="two"><b>{o.name}</b><small>{o.metricool ? `Metricool user ${o.metricool.userId} · ${o.metricool.syncedAt ? `synced ${ago(o.metricool.syncedAt)}` : "not synced yet"}` : "No Metricool login yet"}</small></div></div>
                <div className="row">
                  <Badge s={o.metricool ? "sent" : "queued"}>{o.metricool ? "Connected" : "Not connected"}</Badge>
                  <a className="btn ghost small-btn" href={`/social/connect/start?org=${o._id}`}>Connect Instagram</a>
                  <form action={sync}><input type="hidden" name="id" value={String(o._id)} /><button className="ghost small-btn" disabled={!o.metricool}>Sync accounts</button></form>
                  <form action={removeOrg}><input type="hidden" name="id" value={String(o._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Delete</button></form>
                </div>
              </div>

              {mine.length ? (
                <ul className="feed" style={{ marginTop: ".6rem" }}>
                  {mine.map((a) => (
                    <li key={String(a._id)}>
                      <Avatar name={a.igHandle} />
                      <div className="two"><b>@{a.igHandle}</b><small>{a.brand}{a.connection ? ` · ${a.connection.toLowerCase().replace("_", " ")}` : ""}</small></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small" style={{ margin: ".6rem 0 0" }}>No Instagram accounts imported yet.</p>}

              {(() => {
                const mineConns = conns.filter((c) => String(c.orgId) === String(o._id));
                return (
                  <div style={{ marginTop: ".9rem" }}>
                    <div className="small muted" style={{ marginBottom: ".3rem" }}>Chat bot connections (accounts the client approved through Meta)</div>
                    {mineConns.length ? (
                      <ul className="feed">
                        {mineConns.map((c) => (
                          <li key={String(c._id)}>
                            <Avatar name={c.username ?? c.igId} />
                            <div className="two"><b>@{c.username ?? c.igId}</b><small>connected {ago(c.connectedAt)}{c.test ? " · TEST connection (no Meta, nothing is sent)" : c.subscribed === false ? " · webhook not subscribed" : ""}</small>{c.lastError && <small style={{ color: "var(--bad)" }}>Last problem ({ago(c.lastError.at)}): {c.lastError.message}</small>}</div>
                            <form action={disconnect} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={String(c._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Disconnect</button></form>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="muted small" style={{ margin: 0 }}>None yet. Click &quot;Connect Instagram&quot; and have the client approve their account.</p>}
                  </div>
                );
              })()}

              <details style={{ marginTop: ".75rem" }}>
                <summary className="small">{o.metricool ? "Replace the Metricool login" : "Add the Metricool login"}</summary>
                <form action={saveCreds} className="f2" style={{ marginTop: ".6rem", alignItems: "end" }}>
                  <input type="hidden" name="id" value={String(o._id)} />
                  <label>User id<input name="userId" inputMode="numeric" required maxLength={40} autoComplete="off" /></label>
                  <label>API token<input name="token" type="password" required maxLength={300} autoComplete="off" /></label>
                  <div><button className="small-btn">Save</button></div>
                </form>
              </details>
            </div>
          );
        })}
        {!list.length && <div className="card empty">No organizations yet.</div>}
      </div>
    </>
  );
}
