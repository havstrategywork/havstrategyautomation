// Tiny presentational helpers shared by the pages. Server components, no state.
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const h = hue(name);
  return <span className={`avatar${large ? " lg" : ""}`} style={{ background: `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${(h + 40) % 360} 62% 42%))` }}>{initials}</span>;
}

export const Badge = ({ s, children }: { s: string; children?: React.ReactNode }) => <span className="badge" data-s={s}>{children ?? s}</span>;

export const Score = ({ n }: { n: number }) => <span className={`score ${n >= 70 ? "hi" : n >= 45 ? "mid" : "lo"}`}>{n}</span>;

export const PageHead = ({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) => (
  <div className="head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="row">{children}</div></div>
);

export const ago = (d?: Date | string | null) => {
  if (!d) return "—";
  const m = Math.round((Date.now() - +new Date(d)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// One stroke icon set (24px grid, currentColor), so every icon in the app matches.
const PATHS = {
  grid: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  layers: "M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  handshake: "M11 17l2 2a1.4 1.4 0 0 0 2-2M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2L15 11M2 11l6-6 4 3 2-1 6 5M8 5 2 11l7 7",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  check: "M20 6 9 17l-5-5",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
} as const;
export type IconName = keyof typeof PATHS;
export const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);

export { default as Pagination } from "./Pagination";

