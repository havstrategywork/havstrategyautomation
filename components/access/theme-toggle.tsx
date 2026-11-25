"use client";

import { Moon, Sun } from "lucide-react";

// Same switch and same saved choice (localStorage "theme") as the dashboard, so the theme follows you between both halves.
// Which icon shows is pure CSS (.hub-moon / .hub-sun in hub.css), so nothing flashes.
export function ThemeToggle() {
  const flip = () => {
    const root = document.documentElement;
    const dark = (root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {} // blocked storage: the switch still works for this visit
  };
  return (
    <button type="button" onClick={flip} aria-label="Switch light/dark theme" title="Switch light/dark theme" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground">
      <Moon className="hub-moon h-4 w-4" />
      <Sun className="hub-sun h-4 w-4" />
    </button>
  );
}
