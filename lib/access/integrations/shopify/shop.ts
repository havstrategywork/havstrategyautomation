/** Store-domain handling. No imports, so the onboarding page (browser) and the server share one rule. */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Accepts "my-store", "my-store.myshopify.com" or a pasted https URL; returns the canonical domain or null. */
export function normalizeShopDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const domain = host.includes(".") ? host : `${host}.myshopify.com`;
  return SHOP_DOMAIN.test(domain) ? domain : null;
}
