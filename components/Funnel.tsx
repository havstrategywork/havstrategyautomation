"use client";
// The dashboard's outreach funnel. Each stage is a button: click it to drill into the list behind that number.
// Percentages shown between stages are "this stage's count ÷ the previous stage's count", so they read as a
// step-by-step conversion rate down the funnel, not a share of the total.
import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./ui";

export type FunnelItem = { id: string; title: string; meta?: string; right?: string; href?: string };
export type FunnelStage = { key: string; label: string; icon: IconName; count: number; pct: number | null; items: FunnelItem[]; emptyText: string };

export default function Funnel({ stages }: { stages: FunnelStage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = stages.find((s) => s.key === open) ?? null;

  return (
    <div className="funnel">
      <div className="funnel-row">
        {stages.map((s, i) => (
          <div className="funnel-item" key={s.key}>
            {i > 0 && (
              <div className="funnel-conn">
                <Icon name="arrow" size={16} />
                {s.pct !== null && <span>{s.pct}%</span>}
              </div>
            )}
            <button
              type="button"
              className={`funnel-stage${open === s.key ? " active" : ""}`}
              aria-pressed={open === s.key}
              onClick={() => setOpen(open === s.key ? null : s.key)}
            >
              <span className="ico"><Icon name={s.icon} /></span>
              <div className="funnel-num">{s.count.toLocaleString("en-IN")}</div>
              <div className="funnel-label">{s.label}</div>
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="card funnel-panel">
          <div className="card-head">
            <h2>{active.label}</h2>
            <span className="small muted">{active.count.toLocaleString("en-IN")} total{active.items.length < active.count ? ` · showing ${active.items.length}` : ""}</span>
          </div>
          {active.items.length ? (
            <ul className="feed funnel-list">
              {active.items.map((it) => {
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
            <div className="empty">{active.emptyText}</div>
          )}
        </div>
      )}
    </div>
  );
}
