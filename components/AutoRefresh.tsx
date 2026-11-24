"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server page every few seconds (only while the tab is visible), so new rows appear without a manual reload. */
export default function AutoRefresh({ every = 15 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, every * 1000);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
