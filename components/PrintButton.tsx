"use client";

// "Save as PDF" = the browser's print dialog (no PDF library); the print styles in globals.css hide the sidebar and controls.
export default function PrintButton() {
  return <button type="button" className="ghost" onClick={() => window.print()}>Save as PDF</button>;
}
