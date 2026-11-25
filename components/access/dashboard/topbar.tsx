"use client";

import { LogOut, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/access/ui/avatar";
import { Badge } from "@/components/access/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/access/ui/dropdown-menu";
import { ThemeToggle } from "@/components/access/theme-toggle";
import { NotificationsBell } from "@/components/access/dashboard/notifications-bell";
import { titleCase } from "@/lib/access/utils";

export function TopBar({ name, email, role, demoMode }: { name: string; email: string; role: string; demoMode: boolean }) {
  async function logout() {
    await fetch("/login/logout", { method: "POST" }); // the one dashboard logout: ends the session for both halves
    window.location.href = "/login";
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div>{demoMode ? <Badge variant="info">Demo Mode - simulated data, no real accounts</Badge> : null}</div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationsBell />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface focus-visible:outline-none">
            <Avatar name={name} />
            <div className="text-left">
              <p className="text-sm font-medium leading-tight text-foreground">{name}</p>
              <p className="text-xs leading-tight text-muted">{titleCase(role)}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
