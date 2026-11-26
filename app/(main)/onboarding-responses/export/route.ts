import { db } from "@/lib/db";
import { sheetRows } from "@/lib/onboarding";
import { getForm } from "@/lib/onboardingForm";
import { currentUser } from "@/lib/session";
import { rowsXlsx } from "@/lib/xlsx";

// NOT under /api/: the proxy's login matcher covers it (and lib/roles.ts makes it admin-only). Checked again here, like every other download.
export async function GET() {
  if ((await currentUser())?.role !== "admin") return new Response("sign in as an admin first", { status: 401 });
  const rows = await (await db()).onboarding.find().sort({ at: -1 }).limit(5000).toArray();
  const buf = await rowsXlsx(sheetRows(rows, (await getForm()).steps));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="onboarding-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
