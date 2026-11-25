import type { IconName } from "@/components/ui";
import type { HubRole } from "@/lib/roles";

// One sidebar for the whole platform. The dashboard (app/(main)/layout.tsx) and the Access Hub (components/access/dashboard/sidebar.tsx)
// both render these, so the Access Hub tabs always sit below the System tabs, whichever half you are in.
// Dashboard tabs are filtered with canView(role, href) (lib/roles.ts); Hub tabs also by the optional Hub role list.
export type NavItem = { href: string; label: string; icon: IconName; roles?: HubRole[] };
export type NavGroup = { group: string; items: NavItem[] };

export const MAIN_NAV: NavGroup[] = [
  { group: "Overview", items: [{ href: "/", label: "Dashboard", icon: "grid" }, { href: "/campaigns", label: "Campaigns", icon: "layers" }, { href: "/inbox", label: "Inbox", icon: "inbox" }, { href: "/report", label: "Daily report", icon: "pulse" }] },
  { group: "Data", items: [{ href: "/creators", label: "Creators", icon: "users" }, { href: "/clients", label: "Clients", icon: "briefcase" }, { href: "/outreach", label: "Outreach", icon: "send" }, { href: "/onboarding-responses", label: "Onboarding", icon: "inbox" }] },
  { group: "Social", items: [{ href: "/social", label: "Overview", icon: "grid" }, { href: "/social/reports", label: "Reports", icon: "chart" }, { href: "/social/bots", label: "Chat bots", icon: "chat" }, { href: "/social/orgs", label: "Organizations", icon: "layers" }] },
  { group: "Email", items: [{ href: "/mail", label: "Email agent", icon: "mail" }] },
  { group: "System", items: [{ href: "/automation", label: "Automation", icon: "bolt" }, { href: "/users", label: "Users", icon: "users" }, { href: "/settings", label: "Settings", icon: "settings" }] },
];

export const HUB_NAV: NavGroup = {
  group: "Access Hub",
  items: [
    { href: "/access", label: "Overview", icon: "shield" },
    { href: "/access/clients", label: "Hub clients", icon: "briefcase" },
    { href: "/access/onboarding", label: "Onboarding", icon: "send" },
    { href: "/access/integrations", label: "Integrations", icon: "plug", roles: ["super_admin"] },
    { href: "/access/management", label: "Access management", icon: "check" },
    { href: "/access/notifications", label: "Notifications", icon: "bell" },
    { href: "/access/activity-logs", label: "Activity logs", icon: "scroll", roles: ["super_admin", "account_manager"] },
    { href: "/access/team", label: "Team", icon: "usercog", roles: ["super_admin"] },
    { href: "/access/settings", label: "Hub settings", icon: "cog", roles: ["super_admin"] },
  ],
};

/** The full sidebar for one dashboard role: its dashboard groups, then the Access Hub group (only roles that may open /access). */
export function navFor(canView: (href: string) => boolean, hubRole: HubRole | null): NavGroup[] {
  const groups = MAIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => canView(i.href)) }));
  if (hubRole) groups.push({ ...HUB_NAV, items: HUB_NAV.items.filter((i) => !i.roles || i.roles.includes(hubRole)) });
  return groups.filter((g) => g.items.length);
}
