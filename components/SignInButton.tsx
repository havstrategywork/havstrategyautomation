"use client";
import { useEffect, useRef, useState } from "react";

/** The sign-in button with a loading bar. The form still posts the normal way (it works without JavaScript); this only shows that the click
 *  registered and blocks a second one until the next page arrives. */
export default function SignInButton() {
  const [busy, setBusy] = useState(false), button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    const start = () => setBusy(true); // the browser only fires "submit" once the required fields are filled in
    const reset = () => setBusy(false); // the Back button can restore this page exactly as it was left
    form.addEventListener("submit", start);
    window.addEventListener("pageshow", reset);
    return () => { form.removeEventListener("submit", start); window.removeEventListener("pageshow", reset); };
  }, []);
  return (
    <>
      <button ref={button} disabled={busy} style={{ justifyContent: "center", padding: ".65rem 1rem" }}>{busy ? "Signing in…" : "Sign in"}</button>
      {busy && <div className="load-bar" role="progressbar" aria-label="Signing in"><i /></div>}
    </>
  );
}
