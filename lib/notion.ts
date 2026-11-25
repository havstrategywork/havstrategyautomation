// Minimal Notion client: plain Bearer-token REST calls (no notion SDK dependency), mirroring lib/sheet.ts's style.
// Env: NOTION_API_KEY = an integration's "Internal Integration Secret" (notion.so/my-integrations, create one, no capabilities
// beyond the defaults needed). Share the destination page with that integration first (open it in Notion, "•••" menu >
// Connections > add the integration) — an API token alone can't see or write any page until it's shared.
const VERSION = "2026-03-11";

function headers() {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY is not set (Notion integration secret); see .env.example");
  return { Authorization: `Bearer ${key}`, "Notion-Version": VERSION, "Content-Type": "application/json" };
}

async function call(path: string, method: string, body?: unknown) {
  const r = await fetch(`https://api.notion.com/v1${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion API ${r.status}: ${j.message ?? "request failed"}`);
  return j;
}

/** The page id inside a pasted Notion page link (dashed or not, with or without a title slug). Anything else gives null. */
export function pageIdFromUrl(input: string): string | null {
  const m = input.trim().match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?:[?#][^/]*)?$/i);
  return m ? m[1].replace(/-/g, "").toLowerCase() : null;
}

/** Can this integration see the page? Returns its title, or throws a message the settings page shows as is.
 *  Notion deliberately returns the same 404 whether the id is wrong or just not shared with us — the message covers both. */
export async function checkPage(id: string) {
  try {
    const p = (await call(`/pages/${id}`, "GET")) as { properties?: { title?: { title?: { plain_text: string }[] } } };
    return p.properties?.title?.title?.map((t) => t.plain_text).join("") || "Untitled";
  } catch (e) {
    const m = (e as Error).message;
    if (/Notion API 404/.test(m)) throw new Error('Can\'t find that page. Open it in Notion, click "•••" in the top right > Connections, add this integration, then save again.');
    if (/Notion API 401/.test(m)) throw new Error("The Notion integration token (NOTION_API_KEY) was rejected. Check it in the environment.");
    if (/Notion API 403/.test(m)) throw new Error('This integration can\'t write there. Share the page with it first ("•••" > Connections), then save again.');
    throw e;
  }
}

export type Block = Record<string, unknown>;
const text = (s: string) => [{ type: "text", text: { content: s.slice(0, 1900) } }];
export const h2 = (s: string): Block => ({ object: "block", type: "heading_2", heading_2: { rich_text: text(s) } });
export const h3 = (s: string): Block => ({ object: "block", type: "heading_3", heading_3: { rich_text: text(s) } });
export const p = (s: string): Block => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(s) } });
export const bullet = (s: string): Block => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: text(s) } });
export const divider = (): Block => ({ object: "block", type: "divider", divider: {} });
export const callout = (s: string, emoji = "🔗"): Block => ({ object: "block", type: "callout", callout: { icon: { emoji }, rich_text: text(s) } });

/** A new page under `parentId`, titled `title`, with `blocks` as its content. Notion caps one request at 100 blocks,
 *  so anything past that is appended in follow-up calls (a brief this long is not expected, but never silently truncated). */
export async function createBriefPage(parentId: string, title: string, blocks: Block[]) {
  const r = (await call("/pages", "POST", {
    parent: { type: "page_id", page_id: parentId },
    properties: { title: { title: [{ type: "text", text: { content: title.slice(0, 200) } }] } },
    children: blocks.slice(0, 100),
  })) as { id: string; url: string };
  for (let i = 100; i < blocks.length; i += 100) await call(`/blocks/${r.id}/children`, "PATCH", { children: blocks.slice(i, i + 100) });
  return { id: r.id, url: r.url };
}
