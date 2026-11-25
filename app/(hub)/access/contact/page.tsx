import { LegalPage } from "@/components/access/legal-page";

export default function ContactPage() {
  return (
    <LegalPage title="Contact Support">
      <p>For help connecting your accounts, questions about a request, or to revoke access, reach out to the agency team you&apos;re working with directly, or:</p>
      <ul>
        <li>
          Email: <a href="mailto:support@youragency.com" className="text-primary underline">support@youragency.com</a>
        </li>
        <li>
          Security concerns: see our <a href="/access/security" className="text-primary underline">Security Information</a> page
        </li>
        <li>
          Data deletion requests: see our <a href="/access/data-deletion" className="text-primary underline">Data Deletion</a> page
        </li>
      </ul>
    </LegalPage>
  );
}
