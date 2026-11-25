import type { IconName } from "@/components/ui";
import type { Role } from "@/lib/access/types";

// One sidebar for the whole platform. The dashboard (app/(main)/layout.tsx) and the Access Hub (components/access/dashboard/sidebar.tsx)
// both render these, so the Access Hub tabs always sit below the automation tabs, whichever half you are in.
export type NavItem = { href: string; label: string; icon: IconName; roles?: Role[] };
export type NavGroup = { group: string; items: NavItem[] };

export const MAIN_NAV: NavGroup[] = [
  { group: "Overview", items: [{ href: "/", label: "Dashboard", icon: "grid" }, { href: "/campaigns", label: "Campaigns", icon: "layers" }, { href: "/inbox", label: "Inbox", icon: "inbox" }, { href: "/report", label: "Daily report", icon: "pulse" }] },
  { group: "Data", items: [{ href: "/creators", label: "Creators", icon: "users" }, { href: "/clients", label: "Clients", icon: "briefcase" }, { href: "/outreach", label: "Outreach", icon: "send" }] },
  { group: "System", items: [{ href: "/automation", label: "Automation", icon: "bolt" }] },
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

export const hubNavFor = (role: Role): NavItem[] => HUB_NAV.items.filter((i) => !i.roles || i.roles.includes(role));
