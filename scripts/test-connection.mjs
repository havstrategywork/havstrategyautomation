// Adds (or removes) a FAKE Instagram connection on an organization, so the chat-bot builder can be tried without a Meta app.
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs                 -> only lists the organizations
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs "Org name"      -> adds the test account
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs "Org name" remove -> removes it and its flows
// The connection is flagged test:true: it holds no real token and the bot engine never sends anything through it.
import { MongoClient } from "mongodb";
import { seal } from "../lib/secrets.ts";

const [name, action] = process.argv.slice(2);
const c = await new MongoClient(process.env.MONGODB_URI).connect(), d = c.db();
console.log(`database: ${d.databaseName}`);
const orgs = await d.collection("orgs").find().sort({ name: 1 }).toArray();
const conns = await d.collection("botConnections").find().toArray();
for (const o of orgs) console.log(`  org "${o.name}"  connections: ${conns.filter((x) => String(x.orgId) === String(o._id)).map((x) => `@${x.username}${x.test ? " (test)" : ""}`).join(", ") || "none"}`);
if (!orgs.length) console.log("  (no organizations yet: add one on the Organizations page first)");

if (name) {
  const org = orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (!org) console.log(`\nNo organization named "${name}". Use one of the names above.`);
  else if (action === "remove") {
    const igId = `test-${org._id}`, flows = await d.collection("botFlows").deleteMany({ igId });
    const r = await d.collection("botConnections").deleteOne({ igId, test: true });
    console.log(`\nremoved ${r.deletedCount} test connection and ${flows.deletedCount} of its flows from "${org.name}"`);
  } else {
    await d.collection("botConnections").updateOne({ igId: `test-${org._id}` }, { $set: { orgId: org._id, username: "test_account", token: seal("TEST-ONLY-NOT-A-REAL-TOKEN"), connectedAt: new Date(), subscribed: false, test: true }, $unset: { lastError: "" } }, { upsert: true });
    console.log(`\nadded test connection @test_account to "${org.name}". Open Chat bots, pick that org, and create a flow.`);
  }
}
await c.close();
