// Small server-rendered chart pieces (no chart library). A line chart for daily series existed here and can be restored from git history when the daily job is built.
import type { Dist } from "@/lib/igreport";

const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const fmt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "—" : unit === "%" ? `${n.toFixed(1)}%` : Math.abs(n) >= 1000 ? nf.format(n) : String(Math.round(n * 10) / 10));

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
