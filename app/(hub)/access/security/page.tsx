import { LegalPage } from "@/components/access/legal-page";
import { PRODUCT_NAME } from "@/lib/access/branding";

export default function SecurityPage() {
  return (
    <LegalPage title="Security Information">
      <h2>No passwords, ever</h2>
      <p>{PRODUCT_NAME} never asks for your platform password or one-time codes. Every connection happens through that platform&apos;s own official OAuth authorization screen.</p>
      <h2>Encryption</h2>
      <p>Access and refresh tokens are encrypted at rest using AES-256-GCM before they ever touch the database, and are decrypted only transiently inside privileged backend services.</p>
      <h2>Verified, not assumed, access</h2>
      <p>We never mark a platform as connected until the actual granted permissions have been verified with that platform - authorization and agency access are tracked as separate, explicit states.</p>
      <h2>Your account stays yours</h2>
      <p>Connecting through {PRODUCT_NAME} never changes account ownership or billing. You can revoke access at any time, both from your onboarding page and directly from the platform&apos;s own account settings.</p>
      <h2>Reporting a concern</h2>
      <p>
        If you believe you&apos;ve found a security issue, please contact us via our{" "}
        <a href="/access/contact" className="text-primary underline">
          Contact Support
        </a>{" "}
        page rather than filing a public report.
      </p>
      <p className="text-xs text-muted">
        This page describes how {PRODUCT_NAME} is built. It is not a claim of any specific compliance certification (e.g. SOC 2, ISO 27001) unless
        your agency has separately obtained and documented one.
      </p>
    </LegalPage>
  );
}
