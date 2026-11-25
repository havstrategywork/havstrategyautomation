// Create or reset the ONE login used by the dashboard and the Access Hub: HAV_PW='secret' [HAV_EMAIL=a@b.com] [HAV_ROLE=admin|manager|member] node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>
// Stores only a scrypt hash. Resetting also signs that user out everywhere and clears any lockout.
import { MongoClient } from "mongodb";
import { hashPassword } from "../lib/password.ts";

const username = (process.argv[2] ?? "").trim().toLowerCase(), pw = process.env.HAV_PW;
const email = (process.env.HAV_EMAIL ?? (username.includes("@") ? username : "")).trim().toLowerCase(), role = process.env.HAV_ROLE; // role left out = keep the current one (new users: admin)
if (role && !["admin", "manager", "member"].includes(role)) { console.error("HAV_ROLE must be admin, manager or member"); process.exit(1); }
if (!username || !pw) { console.error("usage: HAV_PW=... node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>"); process.exit(1); }
if (pw.length < 10) console.warn("warning: password is shorter than 10 characters; prefer a long passphrase.");
const c = await new MongoClient(process.env.MONGODB_URI).connect(), d = c.db();
await d.collection("users").createIndex({ username: 1 }, { unique: true });
await d.collection("users").createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
const u = await d.collection("users").findOneAndUpdate(
  { username },
  { $set: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date(), ...(email && { email }), ...(role && { role }) }, $unset: { fails: "", lockedUntil: "", lockCount: "" }, $setOnInsert: { username, createdAt: new Date(), ...(!role && { role: "admin" }) } },
  { upsert: true, returnDocument: "after" },
);
const out = await d.collection("sessions").deleteMany({ userId: u._id });
console.log(`user "${username}" saved (role ${u.role ?? "admin"}, password hashed); ${out.deletedCount} old session(s) ended`);
await c.close();
