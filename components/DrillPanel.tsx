import Link from "next/link";

// One row in a drill-down list: shared by the funnel and the quick-stat buttons.
export type FunnelItem = { id: string; title: string; meta?: string; right?: string; href?: string };

export function DrillPanel({ title, count, items, emptyText }: { title: string; count: number; items: FunnelItem[]; emptyText: string }) {
  return (
    <div className="card funnel-panel">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="small muted">{count.toLocaleString("en-IN")} total{items.length < count ? ` · showing ${items.length}` : ""}</span>
      </div>
      {items.length ? (
        <ul className="feed funnel-list">
          {items.map((it) => {
            const row = (
              <>
                <div className="two" style={{ minWidth: 0 }}>
                  <b>{it.title}</b>
                  {it.meta && <small>{it.meta}</small>}
                </div>
                {it.right && <span className="t">{it.right}</span>}
              </>
            );
            return <li key={it.id}>{it.href ? <Link href={it.href} style={{ display: "flex", gap: ".75rem", alignItems: "center", flex: 1, minWidth: 0, color: "inherit" }}>{row}</Link> : row}</li>;
          })}
        </ul>
      ) : (
        <div className="empty">{emptyText}</div>
      )}
    </div>
  );
}
