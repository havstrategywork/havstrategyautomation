import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cfg, missingEnv } from "@/lib/meta";
import { currentUser } from "@/lib/session";
import { Avatar, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

// Every action re-checks the role: the proxy already blocks the page, but a server action must never trust that alone.
async function admin() {
  if ((await currentUser())?.role !== "admin") redirect("/login");
}
const done = (msg: string) => redirect(`/social/orgs?m=${encodeURIComponent(msg)}`);
const oid = (f: FormData) => { const v = String(f.get("id") ?? ""); return ObjectId.isValid(v) ? new ObjectId(v) : null; };

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

async function disconnect(f: FormData) {
  "use server";
  await admin();
  const id = oid(f), { botConnections, botFlows, botSessions, igDaily, igStories } = await db(), c = id ? await botConnections.findOne({ _id: id }) : null;
  if (!c) return done("No such connection.");
  const gone = await botFlows.deleteMany({ igId: c.igId }); // its flows and saved report history go with it: they cannot be used without the account
  await botSessions.deleteMany({ _id: new RegExp(`^${c.igId.replace(/\D/g, "")}:`) });
  await Promise.all([igDaily.deleteMany({ igId: c.igId }), igStories.deleteMany({ igId: c.igId }), botConnections.deleteOne({ _id: id! })]);
  revalidatePath("/social/orgs"); done(`Disconnected @${c.username ?? c.igId}${gone.deletedCount ? ` and deleted its ${gone.deletedCount} flow${gone.deletedCount === 1 ? "" : "s"}` : ""}. To revoke access fully, remove the app in the client's Instagram settings.`);
}

export default async function Orgs({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { orgs, botConnections } = await db();
  const [list, conns] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), botConnections.find().sort({ username: 1 }).toArray()]);
  const missing = missingEnv(), app = cfg().app || "<APP_URL>";

  return (
    <>
      <PageHead title="Organizations" sub="Each org is one client. Connect its Instagram accounts through Meta: they power both the Reports and the Chat bots." />
      {m && <div className="notice" role="status">{m}</div>}
      {missing.length > 0 && (
        <div className="notice" style={{ borderLeftColor: "var(--warn)" }}>
          <b>The Meta app is not set up yet.</b> Missing in the environment: {missing.join(", ")}.
          <div className="small muted" style={{ marginTop: ".35rem" }}>In the Meta app: use case &quot;Manage messaging &amp; content on Instagram&quot; with Unified login. In the login configuration include the permissions <code>instagram_basic</code>, <code>instagram_manage_messages</code> and <code>instagram_manage_insights</code>. Redirect URL <code>{app}/api/meta/callback</code>. Webhook callback URL <code>{app}/api/meta/webhook</code> with the same verify token as META_VERIFY_TOKEN, subscribed to <code>messages</code> and <code>messaging_postbacks</code>. META_CONFIG_ID is the login configuration&apos;s id. For the daily report history, set CRON_SECRET to the same value as API_KEY on Vercel.</div>
        </div>
      )}

      <form action={addOrg} className="card form">
        <h2 style={{ margin: 0 }}>Add an organization</h2>
        <div className="row" style={{ flexWrap: "nowrap" }}><input name="name" required maxLength={80} autoComplete="off" placeholder="Client or brand name" /><button>Add</button></div>
      </form>

      <div className="grid" style={{ marginTop: "1rem" }}>
        {list.map((o) => {
          const mine = conns.filter((c) => String(c.orgId) === String(o._id));
          return (
            <div key={String(o._id)} className="card">
              <div className="row spread">
                <div className="who"><Avatar name={o.name} /><div className="two"><b>{o.name}</b><small>{mine.length} Instagram account{mine.length === 1 ? "" : "s"} connected</small></div></div>
                <div className="row">
                  <a className="btn ghost small-btn" href={`/social/connect/start?org=${o._id}`}>Connect Instagram</a>
                  <form action={removeOrg}><input type="hidden" name="id" value={String(o._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Delete</button></form>
                </div>
              </div>
              {mine.length ? (
                <ul className="feed" style={{ marginTop: ".6rem" }}>
                  {mine.map((c) => (
                    <li key={String(c._id)}>
                      <Avatar name={c.username ?? c.igId} />
                      <div className="two"><b>@{c.username ?? c.igId}</b><small>connected {ago(c.connectedAt)}{c.test ? " · TEST connection (no Meta, nothing is sent)" : c.subscribed === false ? " · webhook not subscribed" : ""}</small>{c.lastError && <small style={{ color: "var(--bad)" }}>Last problem ({ago(c.lastError.at)}): {c.lastError.message}</small>}</div>
                      <form action={disconnect} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={String(c._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Disconnect</button></form>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small" style={{ margin: ".6rem 0 0" }}>None yet. Click &quot;Connect Instagram&quot; and have the client approve their account.</p>}
            </div>
          );
        })}
        {!list.length && <div className="card empty">No organizations yet.</div>}
      </div>
    </>
  );
}
