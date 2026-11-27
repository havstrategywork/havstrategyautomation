import Link from "next/link";
import { sheetTarget } from "@/lib/onboardingSheet";
import { currentUser } from "@/lib/session";
import { isFormAdmin } from "@/lib/roles";
import { Icon, PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

// Answers are not stored on the website, so there is nothing to list here: this page points to the sheet and warns when answers can't get there.
export default async function Onboarding() {
  const [target, me] = await Promise.all([sheetTarget(), currentUser()]);
  const canEdit = !!me && isFormAdmin(me);

  return (
    <>
      <PageHead title="Onboarding" sub="Answers from the public onboarding form go straight to your Google Sheet. They are not saved on this website.">
        <a className="btn ghost" href="/onboarding" target="_blank" rel="noopener noreferrer">Open the form</a>
        {canEdit && <Link className="btn ghost" href="/onboarding-form"><Icon name="settings" size={16} /> Edit questions</Link>}
        {target && <a className="btn" href={target.url} target="_blank" rel="noopener noreferrer"><Icon name="arrow" size={16} /> Open the answers sheet</a>}
      </PageHead>

      {target ? (
        <div className="card">
          <h2>Where the answers are</h2>
          <p className="muted">Each submission is added as a new row on the &quot;{target.tab}&quot; tab. Uploaded files appear as links. Change the sheet on <Link href="/settings">Settings</Link>.</p>
        </div>
      ) : (
        <div className="notice" role="alert" style={{ borderLeftColor: "var(--bad)" }}>
          <b>The form can&apos;t accept answers right now.</b> Connect your Google Sheet on <Link href="/settings">Settings</Link> and make sure <code>GOOGLE_SA_JSON</code> is set.
        </div>
      )}
    </>
  );
}
