import nodemailer from "nodemailer";
import { db, EMAIL_CAP, emailAllowed, inScope, sentToday } from "./db";

// Sends queued emails via Gmail SMTP, up to today's remaining EMAIL_DAILY_CAP.
export async function sendQueuedEmails() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return { error: "set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local" };
  const { outreach, creators } = await db();
  const remaining = Math.max(0, EMAIL_CAP - (await sentToday("email")));
  const items = await outreach.find({ channel: "email", status: "queued" }).sort({ createdAt: 1 }).limit(remaining).toArray();
  const tx = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  let sent = 0, failed = 0;
  for (const o of items) {
    const c = await creators.findOne({ _id: o.creatorId });
    try {
      if (!c?.email) throw new Error("creator has no email");
      if (!emailAllowed(c.email) || !(await inScope(c))) continue; // test mode / another client's creator: leave it queued, send nothing
      await tx.sendMail({ from: GMAIL_USER, to: c.email, subject: o.subject, text: o.message });
      await outreach.updateOne({ _id: o._id }, { $set: { status: "sent", sentAt: new Date() } });
      sent++;
    } catch (e) {
      await outreach.updateOne({ _id: o._id }, { $set: { status: "failed", error: (e as Error).message } });
      failed++;
    }
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000)); // ponytail: sequential + fixed jitter, fine at <=100/day
  }
  return { sent, failed, remainingToday: remaining - sent };
}
