import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { Badge, PageHead } from "@/components/ui";
import FlowEditor from "@/components/FlowEditor";
import { renameFlow, saveFlow, toggleFlow } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditFlow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { botFlows, botConnections } = await db(), flow = await botFlows.findOne({ _id: new ObjectId(id) });
  if (!flow) notFound();
  const conn = await botConnections.findOne({ igId: flow.igId });

  return (
    <>
      <PageHead title={flow.name} sub={<>Flow for <b>@{conn?.username ?? flow.igId}</b>. <Link href={`/social/bots?org=${flow.orgId}`}>Back to all flows</Link></>}>
        <Badge s={flow.enabled ? "sent" : "queued"}>{flow.enabled ? "On: answering messages" : "Off"}</Badge>
        <form action={toggleFlow}><input type="hidden" name="id" value={id} /><input type="hidden" name="from" value="editor" /><button className="ghost">{flow.enabled ? "Turn off" : "Turn on"}</button></form>
      </PageHead>
      <form action={renameFlow} className="row" style={{ marginBottom: "1rem" }}>
        <input type="hidden" name="id" value={id} />
        <input name="name" defaultValue={flow.name} maxLength={80} style={{ width: 280 }} aria-label="Flow name" />
        <button className="ghost small-btn">Rename</button>
        <span className="small muted">Changes are saved with &quot;Save flow&quot;. A flow that is on uses the last saved version.</span>
      </form>
      <FlowEditor id={id} initial={{ nodes: flow.nodes, edges: flow.edges }} save={saveFlow} />
    </>
  );
}
