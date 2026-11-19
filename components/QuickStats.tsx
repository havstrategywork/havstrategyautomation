"use client";
// DMs today / reply rate / needs you: the same click-to-drill-in behaviour as the funnel, in the smaller stat-card style.
import { useState } from "react";
import { Icon, type IconName } from "./ui";
import { DrillPanel, type FunnelItem } from "./DrillPanel";

export type QuickStat = {
  key: string; label: string; icon: IconName; iconClass?: string;
  value: React.ReactNode; sub: React.ReactNode; warn?: boolean; barPct?: number;
  count: number; items: FunnelItem[]; emptyText: string;
};

export default function QuickStats({ stats }: { stats: QuickStat[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = stats.find((s) => s.key === open) ?? null;

  return (
    <>
      <div className="grid stats">
        {stats.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`card stat stat-btn${open === s.key ? " active" : ""}`}
            aria-pressed={open === s.key}
            onClick={() => setOpen(open === s.key ? null : s.key)}
          >
            <div className="label"><span className={`ico${s.iconClass ? ` ${s.iconClass}` : ""}`}><Icon name={s.icon} /></span>{s.label}</div>
            <div className="value" style={s.warn ? { color: "var(--warn)" } : undefined}>{s.value}</div>
            {s.barPct !== undefined && <div className="bar" role="progressbar" aria-valuenow={s.barPct} aria-valuemax={100}><i style={{ width: `${Math.min(100, s.barPct)}%` }} /></div>}
            <div className="sub" style={s.barPct !== undefined ? { marginTop: ".55rem" } : undefined}>{s.sub}</div>
          </button>
        ))}
      </div>

      {active && <DrillPanel title={active.label} count={active.count} items={active.items} emptyText={active.emptyText} />}
    </>
  );
}
