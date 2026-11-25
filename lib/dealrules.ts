// Pure rules for the client-review step (no database), so they can be tested on their own.
import { parse } from "csv-parse/sync";

export type Answer = { id?: string; handle?: string; decision?: "yes" | "no"; note: string };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
/** "@Foo", "https://www.instagram.com/foo/" -> "foo" */
export const handleKey = (s: unknown) => norm(s).replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/[/?#].*$/, "");

/** The client's returned sheet (CSV or .xlsx, from Google Sheets or Excel) -> their answers. The header row is found by its "Decision" column, so extra title rows,
 *  a different column order, or a missing hidden id column all still work (rows are then matched by Handle). Anything but Yes/No counts as "no answer yet". */
export const csvRows = (csv: string): string[][] => parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: true, delimiter: [",", ";", "\t"] });
export const parseUpload = (csv: string): Answer[] => parseRows(csvRows(csv));

/** Same as parseUpload, from rows already split into cells (an .xlsx tab, or parsed CSV). */
export function parseRows(rows: string[][]): Answer[] {
  const h = rows.findIndex((r) => r.some((c) => norm(c).startsWith("decision")));
  if (h < 0) throw new Error('no "Decision" column found: upload the sheet exactly as exported, with its header row');
  const col = (test: (c: string) => boolean) => rows[h].findIndex((c) => test(norm(c)));
  const [id, handle, profile, dec, note] = [col((c) => c === "id"), col((c) => c === "handle"), col((c) => c === "profile"), col((c) => c.startsWith("decision")), col((c) => c === "note" || c === "notes")];
  return rows.slice(h + 1).map((r) => {
    const d = norm(r[dec]);
    return { id: id >= 0 ? String(r[id] ?? "").trim() || undefined : undefined, handle: handleKey(r[handle >= 0 ? handle : profile]) || handleKey(r[profile]) || undefined, decision: (d === "yes" || d === "no" ? d : undefined) as Answer["decision"], note: String(note >= 0 ? r[note] ?? "" : "").trim().slice(0, 500) };
  }).filter((a) => a.id || a.handle);
}

/** A template whose first line is "Subject: ..." -> { subject, body }. */
export function splitSubject(t: string) {
  const m = t.match(/^\s*Subject:[ \t]*(.+)\r?\n+/i);
  return m ? { subject: m[1].trim(), body: t.slice(m[0].length) } : { subject: "Next steps for our collaboration", body: t };
}

/** Test-mode guard, like IG_ALLOWLIST: unset/blank = live; otherwise only the listed addresses ("none" = nobody). */
export const emailAllowed = (email: string, list = "") => {
  const l = list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !l.length || l.includes(email.trim().toLowerCase());
};

/** Whole days from today (IST) to a "YYYY-MM-DD" deadline: 0 = due today, negative = overdue. null if the date is missing or bad. */
export function daysLeft(deadline: string | undefined, now = new Date()) {
  const m = deadline?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10); // IST date
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "5 days left" / "1 day left" / "due today" / "2 days overdue". */
export function daysLabel(d: number) {
  if (d === 0) return "due today";
  const n = Math.abs(d), s = `${n} day${n === 1 ? "" : "s"}`;
  return d > 0 ? `${s} left` : `${s} overdue`;
}
