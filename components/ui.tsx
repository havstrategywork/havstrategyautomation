// Tiny presentational helpers shared by the pages. Server components, no state.
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return <span className={`avatar${large ? " lg" : ""}`} style={{ background: `hsl(${hue(name)} 55% 45%)` }}>{initials}</span>;
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
