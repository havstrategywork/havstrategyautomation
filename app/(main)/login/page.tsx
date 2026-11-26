import ThemeToggle from "@/components/ThemeToggle";
import { FORM_ADMIN, safeNext } from "@/lib/roles";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = { bad: "Wrong username or password.", locked: "Too many attempts. Try again later." };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next: wanted } = await searchParams;
  const next = safeNext(wanted); // set when the visitor came for the onboarding form editor
  const me = next ? await currentUser() : null; // signed in, but not as the form admin (the proxy let them through to switch)
  return (
    <main className="auth">
      <div className="auth-top"><ThemeToggle /></div>
      <form method="post" action="/login/submit" className="card form">
        <div className="brand"><div className="logo"><img src="/havstrategy-logo.png" alt="HavStrategy logo" width={34} height={34} /></div><div><b>Havstrategy</b><span>Creator outreach</span></div></div>
        <div>
          <h1>Welcome <em>back</em></h1>
          <p className="muted small" style={{ margin: ".3rem 0 0" }}>{next ? <>Only <b>{FORM_ADMIN}</b> can edit the onboarding form.</> : "Sign in to manage creators and outreach."}</p>
        </div>
        {e && MSG[e] && <div className="notice" role="alert" style={{ margin: 0, borderLeftColor: "var(--bad)" }}>{MSG[e]}</div>}
        {me && <div className="notice" style={{ margin: 0 }}>You are signed in as <b>{me.username}</b>. Sign in with the form admin account to continue, or <a href="/">go to your dashboard</a>.</div>}
        {next && <input type="hidden" name="next" value={next} />}
        <label>Username<input name="username" autoComplete="username" required maxLength={64} autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
        <button style={{ justifyContent: "center", padding: ".65rem 1rem" }}>Sign in</button>
      </form>
    </main>
  );
}
