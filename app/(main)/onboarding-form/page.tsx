import Link from "next/link";
import OnboardingEditor from "@/components/OnboardingEditor";
import { PageHead, ago } from "@/components/ui";
import { getForm } from "@/lib/onboardingForm";
import { currentUser } from "@/lib/session";
import { FORM_EDITOR, isFormAdmin } from "@/lib/roles";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingFormPage() {
  const me = await currentUser();
  if (!me || !isFormAdmin(me)) redirect(`/login?next=${FORM_EDITOR}`);
  const { steps, version, updatedAt, by } = await getForm();
  return (
    <>
      <PageHead title="Form editor" sub={<>The questions clients answer on the <Link href="/onboarding" target="_blank">onboarding form</Link>. Changes go live when you save. {updatedAt ? `Last saved ${ago(updatedAt)} by ${by}.` : "Still the original questions."}</>}>
        <a className="btn ghost" href="/onboarding" target="_blank" rel="noopener noreferrer">Open the form</a>
        <Link className="btn ghost" href="/onboarding-responses">See answers</Link>
      </PageHead>
      <OnboardingEditor initial={steps} initialVersion={version} />
    </>
  );
}
