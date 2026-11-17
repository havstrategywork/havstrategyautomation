"use client";
import { useState } from "react";

// Read-only text with a Copy button (used for the scheduled Cowork prompts).
export default function CopyBlock({ text, rows = 10 }: { text: string; rows?: number }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const ta = e.currentTarget.parentElement?.parentElement?.querySelector("textarea");
    try { await navigator.clipboard.writeText(text); } catch { ta?.select(); document.execCommand?.("copy"); }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return (
    <div className="form" style={{ gap: ".5rem" }}>
      <textarea className="prompt-out" rows={rows} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
      <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="small-btn" onClick={copy}>{done ? "Copied ✓" : "Copy prompt"}</button></div>
    </div>
  );
}
