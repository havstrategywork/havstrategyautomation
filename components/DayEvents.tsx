"use client";
// "N events" -> a native <dialog> (centering, backdrop, Escape, focus trap for free). The list is only rendered while open, so 14 rows cost nothing.
import { useRef, useState } from "react";
import { Icon } from "@/components/ui";

const kind = (t: string) => /FAILED|not delivered|declined/i.test(t) ? "bad" : /escalated/i.test(t) ? "warn" : /deal agreed|guidelines emailed/i.test(t) ? "good" : /offer/i.test(t) ? "info" : "";

export default function DayEvents({ day, log }: { day: string; log: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  if (!log.length) return <span className="muted small">—</span>;
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className="link-btn small" onClick={() => { setOpen(true); ref.current?.showModal(); }}>{log.length} events</button>
      <dialog ref={ref} className="events-modal" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) close(); }}>
        {open && (
          <>
            <header>
              <div><h3>{day}</h3><span className="small muted">{log.length} events</span></div>
              <button type="button" className="icon-btn" onClick={close} aria-label="Close"><Icon name="x" /></button>
            </header>
            <ul>{log.map((l, i) => {
              const m = /^(\d{2}:\d{2}) (.*)$/.exec(l);
              return <li key={i} className={kind(l)}><time>{m?.[1]}</time><span>{m?.[2] ?? l}</span></li>;
            })}</ul>
          </>
        )}
      </dialog>
    </>
  );
}
