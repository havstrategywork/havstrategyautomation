import { LegalPage, LegalPlaceholderNotice } from "@/components/access/legal-page";
import { PRODUCT_NAME } from "@/lib/access/branding";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updatedNote="Placeholder - configure for your agency and jurisdiction before publishing.">
      <LegalPlaceholderNotice />
      <h2>What we access</h2>
      <p>
        When you connect a platform through {PRODUCT_NAME}, we request only the specific permissions shown on each platform&apos;s connection card -
        never your password. Access is granted through each provider&apos;s own official authorization screen (Meta, Google, Instagram).
      </p>
      <h2>Why we access it</h2>
      <p>Access is used solely to provide the marketing services described in your agreement with the agency operating this instance of {PRODUCT_NAME}.</p>
      <h2>How credentials are stored</h2>
      <p>
        Access and refresh tokens are encrypted at rest (AES-256-GCM) and are never visible in this application&apos;s user interface, API
        responses, or activity logs. They are decrypted only transiently, inside backend services, to make an authorized call on your behalf.
      </p>
      <h2>Your controls</h2>
      <ul>
        <li>You can revoke access at any time from your onboarding page, or directly from the provider&apos;s own account settings.</li>
        <li>You can request deletion of your data - see our Data Deletion page.</li>
        <li>Agency access is separate from your account&apos;s application authorization and does not change who owns or bills your account.</li>
      </ul>
      <h2>Data we retain</h2>
      <p>We retain account identifiers, connection status, and activity logs for the duration of our engagement and as required for audit purposes, consistent with applicable law (including India&apos;s data protection framework and, where applicable, GDPR).</p>
      <h2>Contact</h2>
      <p>
        Questions about this policy can be directed to the agency operating this instance via our{" "}
        <a href="/access/contact" className="text-primary underline">
          Contact Support
        </a>{" "}
        page.
      </p>
    </LegalPage>
  );
}
