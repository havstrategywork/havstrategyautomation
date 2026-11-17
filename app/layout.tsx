import "./globals.css";
import NavLink from "@/components/NavLink";
import ThemeToggle, { themeScript } from "@/components/ThemeToggle";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Outreach" };

const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const NAV = [
  ["/", "Dashboard", "M3 13h8V3H3zM13 21h8v-8h-8zM13 3v6h8V3zM3 21h8v-4H3z"],
  ["/creators", "Creators", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"],
  ["/clients", "Clients", "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"],
  ["/outreach", "Outreach", "M22 2 11 13M22 2l-7 20-4-9-9-4z"],
  ["/inbox", "Inbox", "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1"],
] as const;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); // no session = bare page (the proxy only lets /login through)
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {!user ? children : (
          <div className="shell">
            <aside className="side">
              <div className="brand"><div className="logo">O</div><div><b>Outreach</b><span>Creator CRM</span></div></div>
              <nav>{NAV.map(([href, label, d]) => <NavLink key={href} href={href}>{I(d)}<span>{label}</span></NavLink>)}</nav>
              <div className="side-foot">
                <div className="user">Signed in as <b>{user.username}</b></div>
                <ThemeToggle />
                <form method="post" action="/login/logout">
                  <button className="icon-btn" aria-label="Log out" title="Log out">{I("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9")}</button>
                </form>
              </div>
            </aside>
            <main className="main">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
