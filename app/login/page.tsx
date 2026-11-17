import ThemeToggle from "@/components/ThemeToggle";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = { bad: "Wrong username or password.", locked: "Too many attempts. Try again later." };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="auth">
      <div className="auth-top"><ThemeToggle /></div>
      <form method="post" action="/login/submit" className="card form">
        <div className="brand"><div className="logo"><Icon name="spark" /></div><div><b>Havstrategy</b><span>Creator outreach</span></div></div>
        <div>
          <h1>Welcome <em>back</em></h1>
          <p className="muted small" style={{ margin: ".3rem 0 0" }}>Sign in to manage creators and outreach.</p>
        </div>
        {e && MSG[e] && <div className="notice" role="alert" style={{ margin: 0, borderLeftColor: "var(--bad)" }}>{MSG[e]}</div>}
        <label>Username<input name="username" autoComplete="username" required maxLength={64} autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
        <button style={{ justifyContent: "center", padding: ".65rem 1rem" }}>Sign in</button>
      </form>
    </main>
  );
}
