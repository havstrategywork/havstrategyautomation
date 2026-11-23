// Small server-rendered SVG charts (no chart library). One axis, thin 2px lines, recessive grid, native hover tooltips (<title>) on wide hit columns,
// a legend whenever there are 2+ series, and a table view under every chart so values never depend on color or hover.
import type { Dist, Pt } from "@/lib/igreport";

const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const fmt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "—" : unit === "%" ? `${n.toFixed(1)}%` : Math.abs(n) >= 1000 ? nf.format(n) : String(Math.round(n * 10) / 10));
const shortDate = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export type Line = { name: string; color: string; pts: Pt[] };
const W = 480, H = 150, L = 42, R = 8, T = 8, B = 20;

export function LineChart({ title, lines, unit = "" }: { title: string; lines: Line[]; unit?: string }) {
  const dates = [...new Set(lines.flatMap((l) => l.pts.map((p) => p.t)))].sort();
  const vals = lines.flatMap((l) => l.pts.map((p) => p.v));
  return (
    <figure className="chart">
      <figcaption><b>{title}</b>{lines.length > 1 && <span className="legend-inline">{lines.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</span>}</figcaption>
      {dates.length < 2 ? <div className="muted small chart-empty">Not enough data in this period.</div> : (() => {
        const lo = Math.min(0, ...vals), hi = Math.max(...vals, lo + 1), n = dates.length;
        const x = (i: number) => L + ((W - L - R) * i) / (n - 1), y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
        const at = new Map(lines.map((l) => [l.name, new Map(l.pts.map((p) => [p.t, p.v]))]));
        const hitW = (W - L - R) / (n - 1);
        return (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${shortDate(dates[0])} to ${shortDate(dates[n - 1])}`}>
              {[lo, (lo + hi) / 2, hi].map((g) => (
                <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="grid" /><text x={L - 6} y={y(g) + 3.5} textAnchor="end" className="axis">{fmt(g, unit)}</text></g>
              ))}
              {lines.map((l) => {
                const m = at.get(l.name)!;
                const d = dates.map((t, i) => (m.has(t) ? `${i && m.has(dates[i - 1]) ? "L" : "M"}${x(i).toFixed(1)} ${y(m.get(t)!).toFixed(1)}` : "")).join("");
                return <path key={l.name} d={d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
              })}
              <text x={L} y={H - 5} className="axis">{shortDate(dates[0])}</text>
              <text x={W - R} y={H - 5} textAnchor="end" className="axis">{shortDate(dates[n - 1])}</text>
              {dates.map((t, i) => (
                <rect key={t} x={x(i) - hitW / 2} y={T} width={hitW} height={H - T - B} className="hit">
                  <title>{`${shortDate(t)}\n${lines.map((l) => `${l.name}: ${fmt(at.get(l.name)!.get(t), unit)}`).join("\n")}`}</title>
                </rect>
              ))}
            </svg>
            <details className="small"><summary>Table</summary>
              <div className="tablewrap" style={{ maxHeight: 240, overflow: "auto" }}>
                <table><thead><tr><th>Date</th>{lines.map((l) => <th key={l.name}>{l.name}</th>)}</tr></thead>
                  <tbody>{dates.slice(-120).map((t) => <tr key={t}><td>{shortDate(t)}</td>{lines.map((l) => <td key={l.name}>{fmt(at.get(l.name)!.get(t), unit)}</td>)}</tr>)}</tbody></table>
              </div>
            </details>
          </>
        );
      })()}
    </figure>
  );
}

/** Share of the total, as horizontal bars (gender, age, country, city). */
export function BarList({ title, items, max = 8 }: { title: string; items: Dist[]; max?: number }) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1, top = items.slice(0, max), big = Math.max(...top.map((i) => i.value), 1);
  return (
    <figure className="chart">
      <figcaption><b>{title}</b></figcaption>
      {top.length ? (
        <ul className="bars">
          {top.map((i) => (
            <li key={i.key} title={`${i.key}: ${((i.value / total) * 100).toFixed(1)}%`}>
              <span className="bar-label">{i.key}</span>
              <span className="bar-track"><i style={{ width: `${(i.value / big) * 100}%` }} /></span>
              <span className="bar-val">{((i.value / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      ) : <div className="muted small chart-empty">No data (Instagram only shares audience data from 100 followers).</div>}
    </figure>
  );
}
