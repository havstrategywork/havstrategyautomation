// Which Buffer API key an organization uses: its own (pasted on the Organizations page, stored encrypted) or the shared BUFFER_API_KEY.
// Server only: the key is never sent to the browser.
import { bufferKey } from "./buffer";
import type { Org } from "./db";
import { unseal } from "./secrets";

/** "" when there is no usable key. An own key that can't be read (the encryption key changed) does NOT fall back to the shared account. */
export function keyFor(org: Pick<Org, "bufferKey"> | null | undefined): string {
  if (!org?.bufferKey) return bufferKey();
  try { return unseal(org.bufferKey); } catch { return ""; }
}
