import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sheetIdFromUrl } from "@/lib/onboarding";
import { SETTING_ID } from "@/lib/onboardingSheet";
import { checkSheet, serviceEmail } from "@/lib/sheet";
import { pageIdFromUrl, checkPage } from "@/lib/notion";
import { NOTION_SETTING_ID } from "@/lib/notionBrief";
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

async function saveSheet(f: FormData) {
  "use server";
  const me = await admin();
  const link = String(f.get("sheetUrl") ?? "").trim(), tab = String(f.get("tab") ?? "").replace(/[[\]*?:/\\']/g, "").trim().slice(0, 60) || "Onboarding";
  const id = sheetIdFromUrl(link);
  if (!link) return back("Paste the link of your Google Sheet first.");
  if (!id) return back("That doesn't look like a Google Sheets link. It should start with https://docs.google.com/spreadsheets/d/ (a Google Form link won't work).");
  let name: string;
  try { name = await checkSheet(id); } catch (e) { return back((e as Error).message); }
  await (await db()).settings.updateOne({ _id: SETTING_ID }, { $set: { sheetUrl: link, sheetId: id, sheetName: name, tab, updatedAt: new Date(), by: me.username } }, { upsert: true });
  revalidatePath("/settings"); revalidatePath("/onboarding-responses");
  back(`Connected to "${name}". New answers are added to the "${tab}" tab as they come in.`, true);
}

async function disconnect() {
  "use server";
  await admin();
  await (await db()).settings.deleteOne({ _id: SETTING_ID });
  revalidatePath("/settings"); revalidatePath("/onboarding-responses");
  back("Disconnected. The onboarding form can't accept answers until a sheet is connected again.", true);
}

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
  revalidatePath("/settings");
  back(`Connected to "${title}". New briefs are added under it as submissions come in.`, true);
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
  const [s, n] = await Promise.all([settings.findOne({ _id: SETTING_ID }), settings.findOne({ _id: NOTION_SETTING_ID })]);
  const sa = serviceEmail(), fallback = !s?.sheetId && process.env.ONBOARDING_SHEET_ID;
  const notionOn = !!process.env.NOTION_API_KEY, notionFallback = !n?.pageId && process.env.NOTION_PARENT_PAGE_ID;

  return (
    <>
      <PageHead title="Settings" sub="Where the dashboard sends its data." />
      {m && <div className="notice" role="status" style={{ borderLeftColor: ok ? "var(--good)" : "var(--bad)" }}>{m}</div>}

      <div className="card form">
        <div className="card-head"><h2><span className="ico good" style={{ display: "inline-grid", marginRight: ".6rem", verticalAlign: "middle" }}><Icon name="chart" /></span>Onboarding answers → Google Sheet</h2>
          {s?.sheetId && <span className="pill live"><i />Connected</span>}</div>
        <p className="muted" style={{ margin: "-.4rem 0 1rem" }}>Every time a client submits the onboarding form, a new row is added to this sheet. This sheet is the only place answers are kept: they are not saved on the website.</p>

        {!sa && <div className="notice" style={{ borderLeftColor: "var(--warn)" }}><b>The Google service account is not set up yet.</b> Add its JSON key to the environment as <code>GOOGLE_SA_JSON</code> (and turn on the Sheets and Drive APIs for its project), then restart. Until then the form can&apos;t accept answers.</div>}
        {fallback && <div className="notice">Right now the sheet comes from the <code>ONBOARDING_SHEET_ID</code> environment variable. Saving a link here replaces it.</div>}

        {s?.sheetId && (
          <div className="notice" style={{ borderLeftColor: "var(--good)" }}>
            <b>{s.sheetName ?? "Your sheet"}</b> · tab &quot;{s.tab}&quot; · saved {ago(s.updatedAt)}{s.by ? ` by ${s.by}` : ""}
            <div className="small" style={{ marginTop: ".25rem" }}><a href={s.sheetUrl} target="_blank" rel="noopener noreferrer">Open the sheet ↗</a></div>
          </div>
        )}

        <form action={saveSheet} className="form" style={{ boxShadow: "none", border: 0, padding: 0 }}>
          <label>Google Sheet link
            <input name="sheetUrl" type="url" required defaultValue={s?.sheetUrl ?? ""} placeholder="https://docs.google.com/spreadsheets/d/…" autoComplete="off" />
          </label>
          <label>Tab name <span className="muted small">(created automatically if it doesn&apos;t exist)</span>
            <input name="tab" defaultValue={s?.tab ?? "Onboarding"} maxLength={60} autoComplete="off" />
          </label>
          <div className="row"><button disabled={!sa}>Save and connect</button><span className="small muted">We check the link works before saving.</span></div>
        </form>

        <div className="notice" style={{ marginTop: "1.2rem", marginBottom: 0 }}>
          <b>Before you save:</b> open your Google Sheet, click <b>Share</b>, and add {sa ? <code>{sa}</code> : "the service account email"} as an <b>Editor</b>. Use a native Google Sheet (not an uploaded Excel file).
          <div className="small muted" style={{ marginTop: ".3rem" }}>Switching to a new sheet doesn&apos;t move earlier answers: they stay in the old one.</div>
        </div>

        {s?.sheetId && <form action={disconnect} style={{ marginTop: "1rem" }}><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Disconnect this sheet</button></form>}
      </div>

      <div className="card form" style={{ marginTop: "1rem" }}>
        <div className="card-head"><h2><span className="ico violet" style={{ display: "inline-grid", marginRight: ".6rem", verticalAlign: "middle" }}><Icon name="chat" /></span>Onboarding answers → Notion brief</h2>
          {n?.pageId && <span className="pill live"><i />Connected</span>}</div>
        <p className="muted" style={{ margin: "-.4rem 0 1rem" }}>Every submission also gets a short, skimmable brief page in Notion — contact, services, and a snapshot of the key answers, not the full 50+ question dump (that&apos;s the sheet above).</p>

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
