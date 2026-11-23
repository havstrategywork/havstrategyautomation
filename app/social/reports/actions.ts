"use server";
import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { snapshotConnection } from "@/lib/igstore";
import { currentUser } from "@/lib/session";

// "Build history": saves the last 28 finished days for one account right now (the daily job keeps it up to date afterwards).
export async function fillHistory(f: FormData) {
  const me = await currentUser();
  if (me?.role !== "admin" && me?.role !== "social") redirect("/login");
  const id = String(f.get("conn") ?? ""), back = String(f.get("back") ?? ""), to = back.startsWith("/social/reports") ? back : "/social/reports";
  const conn = ObjectId.isValid(id) ? await (await db()).botConnections.findOne({ _id: new ObjectId(id) }) : null;
  let msg = "No such account.";
  if (conn?.test) msg = "This is a test account: there is no real data to save.";
  else if (conn) {
    const r = await snapshotConnection(conn, 28, true);
    msg = r.error && !r.days ? `Could not read history for @${conn.username ?? conn.igId}: ${r.error}` : `Saved ${r.days} day${r.days === 1 ? "" : "s"} of history for @${conn.username ?? conn.igId}${r.failedDays ? ` (${r.failedDays} could not be read)` : ""}.`;
  }
  redirect(`${to}${to.includes("?") ? "&" : "?"}m=${encodeURIComponent(msg)}`);
}
