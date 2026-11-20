// Reads the client's returned .xlsx into plain rows (strings), so the same rules as for a CSV apply.
// Also writes one: the no-Google-Sheet review path (lib/deals.ts#createLocalBatch) downloads a real .xlsx instead.
import readExcelFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { parseRows } from "./dealrules";
import { HEADER } from "./sheet";

/** The first sheet (tab) that has a "Decision" column. A client may send back their whole workbook, with our "Content creators" tab among others. */
export async function xlsxRows(buf: Buffer): Promise<string[][]> {
  const sheets = await readExcelFile(buf);
  for (const s of sheets) {
    const rows = s.data.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? "" : String(c))));
    try { parseRows(rows); return rows; } catch { /* not our tab: try the next one */ }
  }
  throw new Error('no tab with a "Decision" column found in that workbook: upload the file with the creators tab, header row included');
}

/** The review table (same columns as lib/sheet.ts's Google Sheet tab) as a downloadable .xlsx buffer, no Google API involved. */
export async function creatorsXlsx(rows: (string | number)[][]) {
  return writeXlsxFile([HEADER, ...rows]).toBuffer();
}
