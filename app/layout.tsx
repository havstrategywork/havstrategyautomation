import "./globals.css";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import NavLink from "@/components/NavLink";
import ThemeToggle, { themeScript } from "@/components/ThemeToggle";
import BriefChat from "@/components/BriefChat";
import { Icon, type IconName } from "@/components/ui";
import MuiProviders from "@/components/mui/Providers";
import { currentUser } from "@/lib/session";
import { canView, hasApiKey } from "@/lib/roles";

// Self-hosted at build time by next/font (no runtime request to Google, so the CSP stays 'self').
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display", display: "swap" });

export const metadata = { title: "Havstrategy · Outreach", icons: { icon: "/havstrategy-logo.png", shortcut: "/havstrategy-logo.png" } };

const NAV: { group: string; items: [string, string, IconName][] }[] = [
  { group: "Overview", items: [["/", "Dashboard", "grid"], ["/campaigns", "Campaigns", "layers"], ["/inbox", "Inbox", "inbox"], ["/report", "Daily report", "pulse"]] },
  { group: "Data", items: [["/creators", "Creators", "users"], ["/clients", "Clients", "briefcase"], ["/outreach", "Outreach", "send"], ["/onboarding-responses", "Onboarding", "inbox"]] },
  { group: "Social", items: [["/social", "Overview", "grid"], ["/social/reports", "Reports", "chart"], ["/social/bots", "Chat bots", "chat"], ["/social/orgs", "Organizations", "layers"]] },
  { group: "Email", items: [["/mail", "Email agent", "mail"]] },
  { group: "System", items: [["/automation", "Automation", "bolt"], ["/users", "Users", "users"]] },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); // no session = bare page (the proxy only lets /login through)
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <MuiProviders>
        {!user ? children : (
          <div className="shell">
            <aside className="side">
              <div className="brand"><div className="logo"><img src="/havstrategy-logo.png" alt="HavStrategy logo" width={34} height={34} /></div><div><b>Havstrategy</b><span>Creator outreach</span></div></div>
              <nav aria-label="Main">
                {NAV.map((g) => ({ ...g, items: g.items.filter(([href]) => canView(user.role, href)) })).filter((g) => g.items.length).map((g) => (
                  <div key={g.group} className="nav-group">
                    <div className="nav-label">{g.group}</div>
                    {g.items.map(([href, label, icon]) => <NavLink key={href} href={href}><Icon name={icon} /><span>{label}</span></NavLink>)}
                  </div>
                ))}
              </nav>
              <div className="side-foot">
                <span className="me" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
                <div className="user"><b>{user.username}</b><small>{user.role}</small></div>
                <ThemeToggle />
                <form method="post" action="/login/logout">
                  <button className="icon-btn" aria-label="Log out" title="Log out"><Icon name="logout" /></button>
                </form>
              </div>
            </aside>
            <main className="main">{children}</main>
            {/* the chat carries the API key, so only roles that may use the outreach API get it */}
            {hasApiKey(user.role) && <BriefChat appUrl={(process.env.APP_URL ?? "").replace(/\/+$/, "")} apiKey={process.env.API_KEY ?? ""} />}
          </div>
        )}
        </MuiProviders>
      </body>
    </html>
  );
}
