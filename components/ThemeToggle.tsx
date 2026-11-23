"use client";

// Flips light/dark and remembers it in localStorage. Which icon shows is pure CSS (see .theme-btn in globals.css), so nothing flashes.
export default function ThemeToggle() {
  const flip = () => {
    const root = document.documentElement;
    const dark = (root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {} // private mode / blocked storage: the switch still works for this visit
  };
  return (
    <button type="button" className="icon-btn theme-btn" onClick={flip} aria-label="Switch light/dark theme" title="Switch light/dark theme">
      <svg className="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      <svg className="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    </button>
  );
}

// Runs in <head> before first paint: applies the saved choice (or the system's) so the page never flashes the wrong theme.
export const themeScript = `var d=document.documentElement,t=null;try{t=localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t`;
