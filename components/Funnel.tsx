"use client";
// The dashboard's outreach funnel. Each stage is a button: click it to drill into the list behind that number.
import { useState } from "react";
import { Icon, type IconName } from "./ui";
import { DrillPanel, type FunnelItem } from "./DrillPanel";

export type { FunnelItem };
export type FunnelStage = { key: string; label: string; icon: IconName; count: number; items: FunnelItem[]; emptyText: string };

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

      {active && <DrillPanel title={active.label} count={active.count} items={active.items} emptyText={active.emptyText} />}
    </div>
  );
}
