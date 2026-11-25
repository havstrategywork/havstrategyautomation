import { LegalPage, LegalPlaceholderNotice } from "@/components/access/legal-page";
import { PRODUCT_NAME } from "@/lib/access/branding";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updatedNote="Placeholder - configure for your agency and jurisdiction before publishing.">
      <LegalPlaceholderNotice />
      <h2>Service</h2>
      <p>{PRODUCT_NAME} is an account-access onboarding tool used by the agency operating this instance to request, track and verify access to your marketing accounts for the purpose of providing marketing services.</p>
      <h2>Authorization, not ownership</h2>
      <p>Connecting an account through {PRODUCT_NAME} authorizes the agency&apos;s access under the permissions you explicitly approve. It does not transfer ownership, billing control, or any right beyond what you approve on each platform&apos;s own authorization screen.</p>
      <h2>Revocation</h2>
      <p>You may revoke access at any time. Revocation takes effect immediately for new actions; actions already in progress with a provider may not be reversible by us.</p>
      <h2>No warranty of platform behavior</h2>
      <p>Account discovery, permission names, and approval flows are determined by each third-party platform (Meta, Google, Instagram) and may change outside of our control.</p>
      <h2>Governing terms</h2>
      <p>These terms are a placeholder. The agency operating this instance should replace this section with terms reviewed by qualified counsel for its jurisdiction.</p>
    </LegalPage>
  );
}
