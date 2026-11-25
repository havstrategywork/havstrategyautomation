import { LegalPage, LegalPlaceholderNotice } from "@/components/access/legal-page";

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Request">
      <LegalPlaceholderNotice />
      <h2>What gets deleted</h2>
      <p>On request, we delete: encrypted access/refresh tokens for your accounts, selected-asset records, and your contact details. Platform-side access is also revoked where you haven&apos;t already revoked it yourself.</p>
      <h2>What we keep</h2>
      <p>A minimal audit trail (that a deletion occurred, and when) is retained to meet our own recordkeeping and legal obligations. It contains no tokens or account credentials.</p>
      <h2>How to request deletion</h2>
      <p>
        Revoke access yourself at any time from your onboarding page, or email{" "}
        <a href="mailto:privacy@youragency.com" className="text-primary underline">
          privacy@youragency.com
        </a>{" "}
        from the address associated with your account and we&apos;ll confirm once your data has been removed.
      </p>
    </LegalPage>
  );
}
