"use client";
import { useEffect } from "react";

/** Keeps the light/dark theme following the viewer on signed-out pages while they are open: the switch used in another tab, or the system
 *  changing while no choice is saved. (themeScript sets it on load; signed-in pages also get this from Material UI's theme provider.) */
export default function ThemeSync() {
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("theme"); } catch {}
      document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : system.matches ? "dark" : "light";
    };
    const stored = (e: StorageEvent) => { if (e.key === "theme" || e.key === null) apply(); };
    system.addEventListener("change", apply);
    window.addEventListener("storage", stored);
    return () => { system.removeEventListener("change", apply); window.removeEventListener("storage", stored); };
  }, []);
  return null;
}
