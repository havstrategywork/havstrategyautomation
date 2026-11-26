import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { requireProductionSecret } from "@/lib/access/env";

/**
 * Signed, short-lived OAuth `state` parameter (section 15: "cryptographically
 * secure state validation", "replay protection"). Carries the invitation's
 * raw token (not just its DB id) so the callback can redirect the browser
 * back to the right /onboard/<token> page purely from `state` - this leaks
 * nothing new since the browser already holds that same raw token in its
 * current URL, and `state` only ever travels through that same browser.
 *
 * Paired with an httpOnly `oauth_state_nonce` cookie set at the same time
 * (double-submit) so a stolen/replayed `state` value alone, without the
 * matching cookie, is rejected - see lib/integrations/oauth-flow.ts.
 */

async function getSecretKey(): Promise<Uint8Array> {
  const result = requireProductionSecret("SESSION_SECRET", process.env.SESSION_SECRET);
  if (!result.ok) throw new Error(result.error);
  return new TextEncoder().encode(result.value);
}

export interface OAuthState {
  invitationToken: string;
  platform: string;
  nonce: string;
  scopes: string[];
  /** Shopify only: the store domain the client asked to connect; the callback must be for the same store. */
  account?: string;
}

export async function createOAuthState(invitationToken: string, platform: string, scopes: string[], account?: string): Promise<{ state: string; nonce: string }> {
  const nonce = randomBytes(16).toString("base64url");
  const key = await getSecretKey();
  const state = await new SignJWT({ invitationToken, platform, nonce, scopes, ...(account && { account }) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);
  return { state, nonce };
}

export async function verifyOAuthState(state: string, expectedNonce: string): Promise<{ ok: true; value: OAuthState } | { ok: false; error: string }> {
  try {
    const key = await getSecretKey();
    const { payload } = await jwtVerify(state, key);
    const value = payload as unknown as OAuthState;
    if (!value.invitationToken || !value.platform || !value.nonce) {
      return { ok: false, error: "Malformed OAuth state." };
    }
    if (value.nonce !== expectedNonce) {
      return { ok: false, error: "OAuth state nonce mismatch (possible replay or expired session)." };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Invalid or expired OAuth state." };
  }
}
