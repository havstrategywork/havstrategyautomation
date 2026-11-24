import type { Viewport } from "next";
import OnboardingForm from "@/components/OnboardingForm";

// PUBLIC page (listed in proxy.ts's PUBLIC set): clients open this link without a login. Not for search engines.
export const metadata = { title: "Client onboarding · Havstrategy", description: "Tell us about your business so we can get started.", robots: { index: false, follow: false } };
// This page is hand-colored for light mode only (see onboarding.css). "only light" tells the browser not to auto-dark-mode
// or force-invert it (some Windows/Edge setups turn that on for sites that don't declare a scheme), before any CSS even runs.
export const viewport: Viewport = { colorScheme: "only light" };

export default function Onboarding() {
  return <OnboardingForm />;
}
