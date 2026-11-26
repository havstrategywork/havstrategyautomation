"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Bell, Briefcase, Check, Cog, Inbox, Layers, LayoutDashboard, Mail, MessageSquare, Plug, ScrollText, Send, Settings, ShieldCheck, UserCog, Users, Zap } from "lucide-react";
import { cn } from "@/lib/access/utils";
import { navFor } from "@/lib/nav";
import { canView, FORM_EDITOR, isFormAdmin, roleOfHub } from "@/lib/roles";
import type { Role } from "@/lib/access/types";

// Same tab list as the dashboard sidebar (lib/nav.ts), so the Access Hub sits below Automation everywhere. Icons mapped to lucide here.
const ICONS: Record<string, typeof Users> = {
  grid: LayoutDashboard, layers: Layers, inbox: Inbox, pulse: Activity, users: Users, briefcase: Briefcase, send: Send, bolt: Zap,
  chart: BarChart3, chat: MessageSquare, mail: Mail, settings: Settings,
  shield: ShieldCheck, plug: Plug, check: Check, bell: Bell, scroll: ScrollText, usercog: UserCog, cog: Cog,
};

export function Sidebar({ role, email, organizationName }: { role: Role; email: string; organizationName: string }) {
  const pathname = usePathname();
  const groups = navFor((href) => (href === FORM_EDITOR ? isFormAdmin({ username: email, email, role: roleOfHub(role) }) : canView(roleOfHub(role), href)), role === "super_admin" || role === "account_manager" ? role : null);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/havstrategy-logo.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="truncate">
          <p className="truncate text-sm font-semibold text-foreground">Havstrategy</p>
          <p className="truncate text-xs text-muted">{organizationName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.group} className="space-y-0.5">
            <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-widest text-muted">{g.group}</p>
            {g.items.map((item) => {
              const active = item.href === "/access" ? pathname === "/access" : item.href !== "/" && pathname.startsWith(item.href);
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
