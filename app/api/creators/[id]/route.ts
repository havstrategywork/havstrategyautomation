import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { clean } from "@/lib/queries";
import { notify } from "@/lib/notify";
import { overCeiling, parseMoney } from "@/lib/money";
import { ceilingFor } from "@/lib/threads";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  let set;
  try { set = clean(await req.json()); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const { creators } = await db();
  if (set.agreedRate != null) {
    const cur = await creators.findOne({ _id: new ObjectId(id) });
    const ceiling = cur && (await ceilingFor(cur));
    if (!ceiling) return Response.json({ error: "no budget ceiling is set for this creator's client; a human must agree rates" }, { status: 422 });
    const why = overCeiling(parseMoney(set.agreedRate)!, ceiling);
    if (why) return Response.json({ error: `agreedRate ${why}; escalate to a human` }, { status: 422 });
  }
  const r = await creators.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: set }, { returnDocument: "after" });
  if (r && set.status === "Agreed") await notify(`Deal agreed: @${r.igHandle ?? r.name}`, `${r.agreedRate ?? ""} Send the contract/details.`);
  return r ? Response.json(r) : Response.json({ error: "not found" }, { status: 404 });
}
