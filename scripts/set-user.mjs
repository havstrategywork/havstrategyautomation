// Create or reset a dashboard login: HAV_PW='secret' node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>
// Stores only a scrypt hash. Resetting also signs that user out everywhere and clears any lockout.
import { MongoClient } from "mongodb";
import { hashPassword } from "../lib/password.ts";

const username = (process.argv[2] ?? "").trim().toLowerCase(), pw = process.env.HAV_PW;
if (!username || !pw) { console.error("usage: HAV_PW=... node --env-file=.env.local --experimental-strip-types scripts/set-user.mjs <username>"); process.exit(1); }
if (pw.length < 10) console.warn("warning: password is shorter than 10 characters; prefer a long passphrase.");
const c = await new MongoClient(process.env.MONGODB_URI).connect(), d = c.db();
await d.collection("users").createIndex({ username: 1 }, { unique: true });
const u = await d.collection("users").findOneAndUpdate(
  { username },
  { $set: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date() }, $unset: { fails: "", lockedUntil: "", lockCount: "" }, $setOnInsert: { username, createdAt: new Date() } },
  { upsert: true, returnDocument: "after" },
);
const out = await d.collection("sessions").deleteMany({ userId: u._id });
console.log(`user "${username}" saved (password hashed); ${out.deletedCount} old session(s) ended`);
await c.close();
