import OnboardingForm from "@/components/OnboardingForm";

// PUBLIC page (listed in proxy.ts's PUBLIC set): clients open this link without a login. Not for search engines.
export const metadata = { title: "Client onboarding · Havstrategy", description: "Tell us about your business so we can get started.", robots: { index: false, follow: false } };

export default function Onboarding() {
  return <OnboardingForm />;
}
