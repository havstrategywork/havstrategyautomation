export const dynamic = "force-dynamic";

const MSG: Record<string, string> = { bad: "Wrong username or password.", locked: "Too many attempts. Try again later." };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
      <form method="post" action="/login/submit" className="card form" style={{ width: "100%", maxWidth: 360 }}>
        <h2 style={{ margin: 0 }}>Outreach</h2>
        <p className="muted small" style={{ margin: 0 }}>Sign in to continue.</p>
        {e && MSG[e] && <div className="notice" role="alert">{MSG[e]}</div>}
        <label>Username<input name="username" autoComplete="username" required maxLength={64} autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
        <div><button>Sign in</button></div>
      </form>
    </main>
  );
}
