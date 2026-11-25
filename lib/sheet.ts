// Minimal Google Sheets/Drive/Docs/Slides client: service account JWT over plain REST (no googleapis dependency).
// Env: GOOGLE_SA_JSON = the service account's JSON key (one line). Enable the Sheets API, Drive API, Docs API and Slides API for its project.
// The master Terms doc / report Slides deck (see mergeDocToPdf / mergeSlidesToPdf) should live in a folder a REAL Google account owns, shared
// with the service account as Editor: bare service accounts have ~0 Drive storage quota of their own, and files.copy inherits the source
// file's parent by default, so this just works as long as the template wasn't created by the service account itself.
import { createSign } from "node:crypto";

const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

async function token() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("GOOGLE_SA_JSON is not set (service account key); see .env.example");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const scope = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations";
  const head = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const jwt = `${head}.${createSign("RSA-SHA256").update(head).sign(sa.private_key, "base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Google auth failed: ${j.error_description ?? j.error ?? r.status}`);
  return { bearer: `Bearer ${j.access_token}`, email: sa.client_email };
}

async function call(auth: string, url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { Authorization: auth, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google API ${r.status}: ${j.error?.message ?? "request failed"}`);
  return j;
}

/** Binary Drive export (Sheets -> xlsx, Docs -> pdf): files.export only works for Google-native files, and the result isn't JSON. */
async function exportFile(auth: string, id: string, mimeType: string) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(mimeType)}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Google API ${r.status}: couldn't export the file`);
  return Buffer.from(await r.arrayBuffer());
}

/** The review sheet, as a real .xlsx file (all tabs) for the "Download" link on Campaigns. */
export async function exportXlsx(spreadsheetId: string) {
  const { bearer } = await token();
  return exportFile(bearer, spreadsheetId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/** Copies the master Terms doc, fills in {{key}} placeholders, exports it to PDF, then deletes the copy. One call per creator. */
export async function mergeDocToPdf(templateDocId: string, vars: Record<string, string>) {
  const { bearer } = await token();
  const copy = await call(bearer, `https://www.googleapis.com/drive/v3/files/${templateDocId}/copy`, "POST", {});
  const copyId = copy.id as string;
  try {
    const requests = Object.entries(vars).map(([k, v]) => ({ replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: v } }));
    if (requests.length) await call(bearer, `https://docs.googleapis.com/v1/documents/${copyId}:batchUpdate`, "POST", { requests });
    return await exportFile(bearer, copyId, "application/pdf");
  } finally {
    await fetch(`https://www.googleapis.com/drive/v3/files/${copyId}`, { method: "DELETE", headers: { Authorization: bearer }, signal: AbortSignal.timeout(20000) }).catch(() => {});
  }
}

/** Copies the master report Slides template, fills {{key}} text placeholders, exports it (pdf or pptx), then deletes the copy.
 *  Same pattern as mergeDocToPdf, just hitting the Slides API. Native chart objects (bound to embedded sheet data) aren't touched by
 *  replaceAllText -- if the template needs a live chart, swap the number for an insertImage request (e.g. a QuickChart URL) instead. */
export async function mergeSlides(templateId: string, vars: Record<string, string>, mimeType = "application/pdf") {
  const { bearer } = await token();
  const copy = await call(bearer, `https://www.googleapis.com/drive/v3/files/${templateId}/copy`, "POST", {});
  const copyId = copy.id as string;
  try {
    const requests = Object.entries(vars).map(([k, v]) => ({ replaceAllText: { containsText: { text: `{{${k}}}`, matchCase: true }, replaceText: v } }));
    if (requests.length) await call(bearer, `https://slides.googleapis.com/v1/presentations/${copyId}:batchUpdate`, "POST", { requests });
    return await exportFile(bearer, copyId, mimeType);
  } finally {
    await fetch(`https://www.googleapis.com/drive/v3/files/${copyId}`, { method: "DELETE", headers: { Authorization: bearer } }).catch(() => {});
  }
}

export const HEADER = ["id", "Handle", "Profile", "Followers", "Tier", "Eng. %", "Location", "Agreed rate", "About", "Decision (Yes/No)", "Note"];
export const DECISION_COL = 9; // 0-based index of "Decision"; the one column the client edits, plus Note after it

const TAB = "Content creators";

/** Fills one tab with the review table: everything left of Decision is protected (only our service account can edit it), the id column is hidden, Decision is a Yes/No dropdown. */
async function fillTab(bearer: string, email: string, id: string, sheetId: number, title: string, rows: (string | number)[][]) {
  const n = rows.length + 1;
  await call(bearer, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`, "PUT", { values: [HEADER, ...rows] });
  const range = (c0: number, c1: number, r0 = 0) => ({ sheetId, startRowIndex: r0, endRowIndex: n, startColumnIndex: c0, endColumnIndex: c1 });
  await call(bearer, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, "POST", { requests: [
    { setDataValidation: { range: range(DECISION_COL, DECISION_COL + 1, 1), rule: { condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "Yes" }, { userEnteredValue: "No" }] }, showCustomUi: true, strict: true } } },
    { addProtectedRange: { protectedRange: { range: range(0, DECISION_COL), editors: { users: [email] } } } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 11 }, properties: { pixelSize: 140 }, fields: "pixelSize" } },
  ] });
}

/** A brand-new spreadsheet (used when the brief had no sheet link). Anyone with the link can answer. A human hands it to the client and uploads their answers back; the app never reads this sheet. */
export async function createSheet(title: string, rows: (string | number)[][]) {
  const { bearer, email } = await token();
  const s = await call(bearer, "https://sheets.googleapis.com/v4/spreadsheets", "POST", { properties: { title }, sheets: [{ properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } }] });
  const id = s.spreadsheetId as string, gid = s.sheets[0].properties.sheetId as number;
  await fillTab(bearer, email, id, gid, TAB, rows);
  await call(bearer, `https://www.googleapis.com/drive/v3/files/${id}/permissions`, "POST", { role: "writer", type: "anyone" });
  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid}`, tab: TAB };
}

/** A new "Content creators" tab in the CLIENT'S OWN Google Sheet (the link given in the brief). The sheet must be shared with our service account as Editor. Sharing is left as the client set it. */
export async function addTab(spreadsheetId: string, rows: (string | number)[][]) {
  const { bearer, email } = await token();
  try {
    const have = ((await call(bearer, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, "GET")).sheets ?? []).map((x: { properties: { title: string } }) => x.properties.title);
    let title = TAB;
    for (let k = 2; have.includes(title); k++) title = `${TAB} (${k})`; // earlier batches keep their own tab
    const r = await call(bearer, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, "POST", { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] });
    const gid = r.replies[0].addSheet.properties.sheetId as number;
    await fillTab(bearer, email, spreadsheetId, gid, title, rows);
    return { id: spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`, tab: title };
  } catch (e) {
    const m = (e as Error).message;
    if (/Google API (403|404)/.test(m)) throw new Error(`can't open the client's sheet: share it with ${email} as Editor, then try again`);
    if (/not supported for this document/i.test(m)) throw new Error("that link is an Excel file stored in Drive, not a Google Sheet: open it in Drive and use File > Save as Google Sheets, then use the new link");
    throw e;
  }
}

/** The service account's address (what the client must share their sheet with), or undefined when GOOGLE_SA_JSON is missing or broken. No network. */
export function serviceEmail(): string | undefined {
  try { return (JSON.parse(process.env.GOOGLE_SA_JSON ?? "") as { client_email?: string }).client_email; } catch { return undefined; }
}

/** Can we write to this spreadsheet? Returns its name, or throws a message the settings page shows as is. */
export async function checkSheet(id: string) {
  const { bearer, email } = await token();
  let f: { name?: string; mimeType?: string; capabilities?: { canEdit?: boolean } };
  try { f = await call(bearer, `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,capabilities/canEdit&supportsAllDrives=true`, "GET"); }
  catch (e) {
    if (/Google API (403|404)/.test((e as Error).message)) throw new Error(`Can't open that sheet. Open it in Google Sheets, click Share, add ${email} as Editor, then save again.`);
    throw e;
  }
  if (f.mimeType !== "application/vnd.google-apps.spreadsheet") throw new Error("That link is not a Google Sheet (an Excel file stored in Drive won't work). Open it and use File > Save as Google Sheets, then paste the new link.");
  if (!f.capabilities?.canEdit) throw new Error(`${email} can only view that sheet. Change its access to Editor, then save again.`);
  return f.name ?? "Untitled";
}

/** Adds one row at the bottom of `tab` in the agency's own Google Sheet (shared with our service account as Editor). The tab and its header row are created on first use.
 *  RAW input, so an answer that starts with "=" stays plain text instead of becoming a formula. */
export async function appendRow(spreadsheetId: string, tab: string, header: string[], row: (string | number)[]) {
  const { bearer, email } = await token();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, range = encodeURIComponent(`'${tab}'!A1`);
  try {
    let first: unknown[] | undefined;
    try { first = (await call(bearer, `${base}/values/${encodeURIComponent(`'${tab}'!1:1`)}`, "GET")).values?.[0]; }
    catch (e) { // a missing tab is a 400 "Unable to parse range": make it, then write the header
      if (!/Google API 400/.test((e as Error).message)) throw e;
      await call(bearer, `${base}:batchUpdate`, "POST", { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] });
    }
    if (!first?.length) await call(bearer, `${base}/values/${range}?valueInputOption=RAW`, "PUT", { values: [header] });
    await call(bearer, `${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: [row] });
  } catch (e) {
    if (/Google API (403|404)/.test((e as Error).message)) throw new Error(`can't open the Google Sheet: share it with ${email} as Editor`);
    throw e;
  }
}
