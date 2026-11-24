import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";
import FlowEditor from "@/components/FlowEditor";
import { renameFlow, saveFlow, toggleFlow } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditFlow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { botFlows, botConnections } = await db(), flow = await botFlows.findOne({ _id: new ObjectId(id) });
  if (!flow) notFound();
  const conn = await botConnections.findOne({ igId: flow.igId });

  // the editor fills the whole content area (see .main:has(> .editor) in globals.css), so the page header is folded into its top bar
  const lead = (
    <>
      <Link href={`/social/bots?org=${flow.orgId}`} className="btn ghost small-btn">← Flows</Link>
      <form action={renameFlow} className="row" style={{ flexWrap: "nowrap", gap: ".35rem" }}>
        <input type="hidden" name="id" value={id} />
        <input name="name" defaultValue={flow.name} maxLength={80} style={{ width: 150 }} aria-label="Flow name" />
        <button className="ghost small-btn">Rename</button>
      </form>
      <span className="small muted">@{conn?.username ?? flow.igId}</span>
      <Badge s={flow.enabled ? "sent" : "queued"}>{flow.enabled ? "On" : "Off"}</Badge>
      <form action={toggleFlow}><input type="hidden" name="id" value={id} /><input type="hidden" name="from" value="editor" /><button className="ghost small-btn" title="A flow that is on answers messages with its last saved version">{flow.enabled ? "Turn off" : "Turn on"}</button></form>
    </>
  );
  return <FlowEditor id={id} initial={{ nodes: flow.nodes, edges: flow.edges }} save={saveFlow} lead={lead} />;
}
