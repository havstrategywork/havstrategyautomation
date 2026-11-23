import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ROLES, roleOf, type Role } from "@/lib/roles";
import { currentUser } from "@/lib/session";
import { Avatar, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

const ABOUT: Record<Role, string> = { admin: "Everything, and manages logins", outreach: "Creators, clients, campaigns, inbox (no Email, no Users)", mail: "Email dashboard only" };

// Every action re-checks the role: the proxy already blocks the page, but a server action must never trust that alone.
async function admin() {
  const me = await currentUser();
  if (me?.role !== "admin") redirect("/login");
  return me;
}
const done = (msg: string) => redirect(`/users?m=${encodeURIComponent(msg)}`);
const role = (f: FormData) => { const r = String(f.get("role")); return (ROLES as readonly string[]).includes(r) ? (r as Role) : "outreach"; };
const adminsLeft = async (except?: ObjectId) => (await db()).users.countDocuments({ $or: [{ role: "admin" }, { role: { $exists: false } }], ...(except && { _id: { $ne: except } }) });

async function create(f: FormData) {
  "use server";
  await admin();
  const username = String(f.get("username") ?? "").trim().toLowerCase(), pw = String(f.get("password") ?? "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return done("Username: 3-32 letters, numbers, . _ -");
  if (pw.length < 10) return done("Password needs at least 10 characters.");
  const { users } = await db();
  if (await users.findOne({ username })) return done(`"${username}" already exists.`);
  await users.insertOne({ username, role: role(f), passwordHash: await hashPassword(pw), createdAt: new Date() });
  revalidatePath("/users"); done(`Created ${username}.`);
}

async function setRole(f: FormData) {
  "use server";
  await admin();
  const id = new ObjectId(String(f.get("id"))), { users } = await db(), u = await users.findOne({ _id: id });
  if (!u) return done("No such user.");
  if (roleOf(u.role) === "admin" && role(f) !== "admin" && !(await adminsLeft(id))) return done("Keep at least one admin.");
  await users.updateOne({ _id: id }, { $set: { role: role(f) } });
  revalidatePath("/users"); done(`${u.username} is now ${role(f)}.`);
}

async function resetPw(f: FormData) {
  "use server";
  await admin();
  const id = new ObjectId(String(f.get("id"))), pw = String(f.get("password") ?? ""), { users, sessions } = await db();
  if (pw.length < 10) return done("Password needs at least 10 characters.");
  await users.updateOne({ _id: id }, { $set: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date() }, $unset: { fails: "", lockedUntil: "", lockCount: "" } });
  await sessions.deleteMany({ userId: id }); // signs them out everywhere
  done("Password changed; they were signed out.");
}

async function remove(f: FormData) {
  "use server";
  const me = await admin();
  const id = new ObjectId(String(f.get("id"))), { users, sessions } = await db(), u = await users.findOne({ _id: id });
  if (!u) return done("No such user.");
  if (String(id) === String(me.id)) return done("You can't delete yourself.");
  if (roleOf(u.role) === "admin" && !(await adminsLeft(id))) return done("Keep at least one admin.");
  await users.deleteOne({ _id: id }); await sessions.deleteMany({ userId: id });
  revalidatePath("/users"); done(`Deleted ${u.username}.`);
}

export default async function Users({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [{ m }, me, { users }] = await Promise.all([searchParams, admin(), db()]);
  const list = await users.find().sort({ createdAt: 1 }).toArray();
  const sel = (r: Role) => <select name="role" defaultValue={r}>{ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select>;

  return (
    <>
      <PageHead title="Users" sub="Logins for the dashboard. Each role only sees its own pages; you (admin) see everything." />
      {m && <div className="notice" role="status">{m}</div>}

      <form action={create} className="card form">
        <h2 style={{ margin: 0 }}>Add a login</h2>
        <div className="f2">
          <label>Username<input name="username" required minLength={3} maxLength={32} autoComplete="off" /></label>
          <label>Password<input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" placeholder="10+ characters" /></label>
          <label>Role{sel("mail")}</label>
        </div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>{ROLES.map((r) => <li key={r}><b>{r}</b>: {ABOUT[r]}</li>)}</ul>
        <div><button>Create login</button></div>
      </form>

      <div className="tablewrap" style={{ marginTop: "1rem" }}>
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Created</th><th>New password</th><th /></tr></thead>
          <tbody>
            {list.map((u) => {
              const you = String(u._id) === String(me.id);
              return (
                <tr key={String(u._id)}>
                  <td><div className="who"><Avatar name={u.username} /><div className="two"><b>{u.username}</b>{you && <small>you</small>}</div></div></td>
                  <td><form action={setRole} className="row" style={{ flexWrap: "nowrap" }}><input type="hidden" name="id" value={String(u._id)} />{sel(roleOf(u.role))}<button className="ghost small-btn">Save</button></form></td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{ago(u.createdAt)}</td>
                  <td><form action={resetPw} className="row" style={{ flexWrap: "nowrap" }}><input type="hidden" name="id" value={String(u._id)} /><input name="password" type="password" minLength={10} maxLength={200} required autoComplete="new-password" placeholder="10+ characters" /><button className="ghost small-btn">Reset</button></form></td>
                  <td>{!you && <form action={remove}><input type="hidden" name="id" value={String(u._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Delete</button></form>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
