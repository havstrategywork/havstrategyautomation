import Link from "next/link";
import { PRODUCT_SHORT_NAME } from "@/lib/access/branding";

export function LegalPage({ title, updatedNote, children }: { title: string; updatedNote?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; {PRODUCT_SHORT_NAME}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">{title}</h1>
        {updatedNote ? <p className="mt-1 text-sm text-muted">{updatedNote}</p> : null}
        <div className="prose prose-sm mt-6 max-w-none space-y-4 text-sm leading-6 text-foreground [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LegalPlaceholderNotice() {
  return (
    <div className="rounded-md border border-warning-border bg-warning-bg p-3 text-xs text-foreground">
      This page is a configurable placeholder provided for structure only. It has not been reviewed by a lawyer and must not be relied on as a
      compliance or legal statement until your own counsel has reviewed and approved it for your jurisdiction and business.
    </div>
  );
}
