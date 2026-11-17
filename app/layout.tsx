import "./globals.css";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import NavLink from "@/components/NavLink";
import ThemeToggle, { themeScript } from "@/components/ThemeToggle";
import BriefChat from "@/components/BriefChat";
import { Icon, type IconName } from "@/components/ui";
import { currentUser } from "@/lib/session";

// Self-hosted at build time by next/font (no runtime request to Google, so the CSP stays 'self').
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display", display: "swap" });

export const metadata = { title: "Havstrategy · Outreach" };

const NAV: { group: string; items: [string, string, IconName][] }[] = [
  { group: "Overview", items: [["/", "Dashboard", "grid"], ["/campaigns", "Campaigns", "layers"], ["/inbox", "Inbox", "inbox"]] },
  { group: "Data", items: [["/creators", "Creators", "users"], ["/clients", "Clients", "briefcase"], ["/outreach", "Outreach", "send"]] },
  { group: "System", items: [["/automation", "Automation", "bolt"]] },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); // no session = bare page (the proxy only lets /login through)
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {!user ? children : (
          <div className="shell">
            <aside className="side">
              <div className="brand"><div className="logo"><Icon name="spark" /></div><div><b>Havstrategy</b><span>Creator outreach</span></div></div>
              <nav aria-label="Main">
                {NAV.map((g) => (
                  <div key={g.group} className="nav-group">
                    <div className="nav-label">{g.group}</div>
                    {g.items.map(([href, label, icon]) => <NavLink key={href} href={href}><Icon name={icon} /><span>{label}</span></NavLink>)}
                  </div>
                ))}
              </nav>
              <div className="side-foot">
                <span className="me" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
                <div className="user"><b>{user.username}</b><small>Signed in</small></div>
                <ThemeToggle />
                <form method="post" action="/login/logout">
                  <button className="icon-btn" aria-label="Log out" title="Log out"><Icon name="logout" /></button>
                </form>
              </div>
            </aside>
            <main className="main">{children}</main>
            <BriefChat appUrl={(process.env.APP_URL ?? "").replace(/\/+$/, "")} apiKey={process.env.API_KEY ?? ""} />
          </div>
        )}
      </body>
    </html>
  );
}
