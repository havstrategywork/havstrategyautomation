import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pageIdFromUrl, checkPage } from "@/lib/notion";
import { NOTION_SETTING_ID, pushUnsentNotion } from "@/lib/notionBrief";
import { currentUser } from "@/lib/session";
import { Icon, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

// Every action re-checks the role: the proxy already blocks the page, but a server action must never trust that alone.
async function admin() {
  const me = await currentUser();
  if (me?.role !== "admin") redirect("/login");
  return me;
}
const back = (msg: string, ok = false) => redirect(`/settings?${new URLSearchParams({ m: msg, ...(ok && { ok: "1" }) })}`);

async function saveNotion(f: FormData) {
  "use server";
  const me = await admin();
  const link = String(f.get("pageUrl") ?? "").trim();
  const id = pageIdFromUrl(link);
  if (!link) return back("Paste the link of your Notion page first.");
  if (!id) return back("That doesn't look like a Notion page link.");
  let title: string;
  try { title = await checkPage(id); } catch (e) { return back((e as Error).message); }
  await (await db()).settings.updateOne({ _id: NOTION_SETTING_ID }, { $set: { pageUrl: link, pageId: id, pageTitle: title, updatedAt: new Date(), by: me.username } }, { upsert: true });
  const n = await pushUnsentNotion(); // answers that arrived before the link was saved (or whose push failed) go in now
  revalidatePath("/settings"); revalidatePath("/onboarding-responses");
  back(`Connected to "${title}". New briefs are added under it as submissions come in${n ? `, and ${n} earlier submission${n === 1 ? " was" : "s were"} sent now` : ""}.`, true);
}

async function disconnectNotion() {
  "use server";
  await admin();
  await (await db()).settings.deleteOne({ _id: NOTION_SETTING_ID });
  revalidatePath("/settings");
  back("Disconnected. New submissions no longer get a Notion brief.", true);
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string }> }) {
  const { m, ok } = await searchParams;
  const { settings } = await db();
  const n = await settings.findOne({ _id: NOTION_SETTING_ID });
  const notionOn = !!process.env.NOTION_API_KEY, notionFallback = !n?.pageId && process.env.NOTION_PARENT_PAGE_ID;

  return (
    <>
      <PageHead title="Settings" sub="Where the dashboard sends its data." />
      {m && <div className="notice" role="status" style={{ borderLeftColor: ok ? "var(--good)" : "var(--bad)" }}>{m}</div>}

      <div className="card form">
        <div className="card-head"><h2><span className="ico violet" style={{ display: "inline-grid", marginRight: ".6rem", verticalAlign: "middle" }}><Icon name="chat" /></span>Onboarding answers → Notion brief</h2>
          {n?.pageId && <span className="pill live"><i />Connected</span>}</div>
        <p className="muted" style={{ margin: "-.4rem 0 1rem" }}>Every submission also gets a short, skimmable brief page in Notion — contact, services, and a snapshot of the key answers, not every answer (those are on the Onboarding page).</p>

        {!notionOn && <div className="notice" style={{ borderLeftColor: "var(--warn)" }}><b>The Notion integration is not set up yet.</b> Add its secret to the environment as <code>NOTION_API_KEY</code>, then restart. Without it the link can&apos;t be checked.</div>}
        {notionFallback && <div className="notice">Right now the page comes from the <code>NOTION_PARENT_PAGE_ID</code> environment variable. Saving a link here replaces it.</div>}

        {n?.pageId && (
          <div className="notice" style={{ borderLeftColor: "var(--good)" }}>
            <b>{n.pageTitle ?? "Your page"}</b> · saved {ago(n.updatedAt)}{n.by ? ` by ${n.by}` : ""}
            <div className="small" style={{ marginTop: ".25rem" }}><a href={n.pageUrl} target="_blank" rel="noopener noreferrer">Open the page ↗</a></div>
          </div>
        )}

        <form action={saveNotion} className="form" style={{ boxShadow: "none", border: 0, padding: 0 }}>
          <label>Notion page link <span className="muted small">(briefs are created as new pages under this one)</span>
            <input name="pageUrl" type="url" required defaultValue={n?.pageUrl ?? ""} placeholder="https://www.notion.so/…" autoComplete="off" />
          </label>
          <div className="row"><button disabled={!notionOn}>Save and connect</button><span className="small muted">We check access before saving.</span></div>
        </form>

        <div className="notice" style={{ marginTop: "1.2rem", marginBottom: 0 }}>
          <b>Before you save:</b> open the Notion page, click <b>&bull;&bull;&bull;</b> in the top right &gt; <b>Connections</b>, and add your integration. A Notion API token can&apos;t see or write any page until it&apos;s shared this way.
        </div>

        {n?.pageId && <form action={disconnectNotion} style={{ marginTop: "1rem" }}><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Disconnect this page</button></form>}
      </div>
    </>
  );
}
