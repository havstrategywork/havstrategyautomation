import "./globals.css";
import NavLink from "@/components/NavLink";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Outreach" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); // no session = bare page (the proxy only lets /login through)
  return (
    <html lang="en">
      <body>
        {!user ? children : <div className="shell">
          <aside className="side">
            <div className="brand"><div className="logo">O</div><div><b>Outreach</b><span>Creator CRM</span></div></div>
            <nav>
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/creators">Creators</NavLink>
              <NavLink href="/clients">Clients</NavLink>
              <NavLink href="/outreach">Outreach</NavLink>
              <NavLink href="/inbox">Inbox</NavLink>
            </nav>
            <form method="post" action="/login/logout" style={{ marginTop: "auto", padding: "1rem" }}><button className="ghost">Log out ({user.username})</button></form>
          </aside>
          <main className="main">{children}</main>
        </div>}
      </body>
    </html>
  );
}
