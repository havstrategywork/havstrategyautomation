"use client";
// The DB write happens server-side in app/api/uploadthing/core.ts#onUploadComplete; this just triggers the upload and refreshes the page after.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadButton } from "@/lib/uploadthing";

export function GuidelinesUpload({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <div className="row" style={{ gap: ".5rem", alignItems: "center" }}>
      <UploadButton
        endpoint="brandFile"
        input={{ clientId }}
        onClientUploadComplete={() => { setErr(""); router.refresh(); }}
        onUploadError={(e) => setErr(e.message)}
      />
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}
