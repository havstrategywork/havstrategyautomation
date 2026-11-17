import { parse } from "csv-parse/sync";
import { STATUSES, tierOf } from "./fields.ts";

// Your sheet's columns, in order. Extras (for scoring) are optional and come last.
export const HEADERS = [
  "Instagram Handle", "Profile Link", "Name", "Followers", "Tier", "IG Category", "Location (per bio)", "Public Email",
  "Notes (from bio)", "Suggested via (client reference)", "Times Suggested", "Status", "DM Sent", "Response",
  "Quoted Rate", "Agreed Rate", "Outreach Notes", "Last Checked", "Follow-up Sent", "Phone / WhatsApp", "Contact Source",
];
export const EXTRA_HEADERS = ["Niches", "Engagement %", "Past Collabs", "Collab Rating", "Collab Notes"];

/** "12,500" -> 12500, "12.5k" -> 12500, "1.2M" -> 1200000, "" -> undefined */
export function num(s?: string): number | undefined {
  const m = s?.trim().replace(/,/g, "").replace(/%$/, "").match(/^(-?[\d.]+)\s*([km])?$/i);
  if (!m) return undefined;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2]?.toLowerCase() as "k" | "m"] ?? 1);
  return isNaN(n) ? undefined : n;
}

/** ISO or DD/MM/YYYY (day first, as in the UAE/India). Returns undefined if unparseable. */
export function parseDate(s?: string): Date | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const d = dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(t);
  return isNaN(+d) ? undefined : d;
}

export type Parsed = { payload: Record<string, unknown>; suggestedNames: string[]; warnings: string[] };

export function parseCsv(text: string): Parsed[] {
  const recs: Record<string, string>[] = parse(text, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), bom: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  return recs.map((r, i) => {
    const g = (h: string) => r[h.toLowerCase()] || undefined;
    const warnings: string[] = [];
    const date = (h: string) => {
      const v = g(h), d = parseDate(v);
      if (v && !d) warnings.push(`row ${i + 2}: can't read ${h} "${v}"`);
      return d;
    };
    let status = g("Status");
    if (status) {
      const canon = STATUSES.find((s) => s.toLowerCase() === status!.toLowerCase());
      if (!canon) warnings.push(`row ${i + 2}: unknown Status "${status}" (use ${STATUSES.join(", ")})`);
      status = canon;
    }
    const collab = [g("Past Collabs"), g("Collab Rating"), g("Collab Notes")];
    return {
      suggestedNames: (g("Suggested via (client reference)") ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
      warnings,
      payload: {
        source: "csv",
        igHandle: g("Instagram Handle") ?? g("Profile Link"), name: g("Name"), followers: num(g("Followers")),
        igCategory: g("IG Category"), location: g("Location (per bio)"), email: g("Public Email"), notes: g("Notes (from bio)"),
        status, dmSentAt: date("DM Sent"), response: g("Response"),
        quotedRate: g("Quoted Rate"), agreedRate: g("Agreed Rate"), // text like "10k INR"; validated when stored
        outreachNotes: g("Outreach Notes"), lastChecked: date("Last Checked"), followUpSentAt: date("Follow-up Sent"),
        phone: g("Phone / WhatsApp"), contactSource: g("Contact Source"),
        niches: g("Niches")?.split(/[;,|]/), engagementRate: num(g("Engagement %")),
        collab: collab.some(Boolean) ? { count: num(collab[0]) ?? 0, rating: num(collab[1]) ?? 0, notes: collab[2] ?? "" } : undefined,
      },
    };
  });
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

type Row = {
  igHandle?: string; name: string; followers: number; igCategory?: string; location?: string; email?: string; notes: string;
  suggestedVia?: unknown[]; status?: string; dmSentAt?: Date; response?: string; quotedRate?: string; agreedRate?: string;
  outreachNotes?: string; lastChecked?: Date; followUpSentAt?: Date; phone?: string; contactSource?: string;
  niches: string[]; engagementRate?: number; collab: { count: number; rating: number; notes: string };
};

export function exportCsv(creators: Row[], clientName: (id: unknown) => string) {
  return toCsv([
    [...HEADERS, ...EXTRA_HEADERS],
    ...creators.map((c) => [
      c.igHandle, c.igHandle && `https://www.instagram.com/${c.igHandle}/`, c.name, c.followers, tierOf(c.followers), c.igCategory, c.location, c.email,
      c.notes, (c.suggestedVia ?? []).map(clientName).join("; "), c.suggestedVia?.length ?? 0, c.status ?? "New", day(c.dmSentAt), c.response,
      c.quotedRate, c.agreedRate, c.outreachNotes, day(c.lastChecked), day(c.followUpSentAt), c.phone, c.contactSource,
      c.niches.join("; "), c.engagementRate, c.collab.count, c.collab.rating, c.collab.notes,
    ]),
  ]);
}
