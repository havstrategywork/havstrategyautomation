// Metricool API client (https://app.metricool.com/api; needs an Advanced/Custom Metricool plan). Every call sends the token in X-Mc-Auth
// plus userId (and blogId for brand data) as query parameters. METRICOOL_BASE overrides the host (tests use a local stub).
export const BASE = () => process.env.METRICOOL_BASE ?? "https://app.metricool.com/api";

export type Creds = { userId: string; token: string }; // token already decrypted
export type Profile = { id: number; label?: string; title?: string; url?: string; instagram?: string; instagramPicture?: string; picture?: string; instagramConnectionType?: string };
export type IgAccount = { blogId: number; brand: string; igHandle: string; picture?: string; connection?: string };

export class MetricoolError extends Error {}

type Q = Record<string, string | number | string[] | undefined>;
export async function mc<T = unknown>(c: Creds, path: string, q: Q = {}): Promise<T> {
  const url = new URL(BASE() + path);
  url.searchParams.set("userId", c.userId);
  for (const [k, v] of Object.entries(q)) for (const x of [v].flat()) if (x !== undefined && x !== "") url.searchParams.append(k, String(x));
  let r: Response;
  try { r = await fetch(url, { headers: { "X-Mc-Auth": c.token, Accept: "application/json" }, signal: AbortSignal.timeout(25_000), cache: "no-store" }); }
  catch { throw new MetricoolError("Could not reach Metricool (timeout or network)."); }
  if (r.status === 401 || r.status === 403) throw new MetricoolError("Metricool refused the token or user id. The API needs an Advanced or Custom plan; check both values.");
  if (!r.ok) throw new MetricoolError(`Metricool answered ${r.status}.`);
  return r.json() as Promise<T>;
}

/** The org's brands that have an Instagram account connected. (Metricool lists every brand; many have no Instagram.) */
export const igAccountsFrom = (profiles: Profile[]): IgAccount[] =>
  profiles.filter((p) => p.id && p.instagram?.trim()).map((p) => ({
    blogId: p.id, brand: p.label || p.title || `Brand ${p.id}`, igHandle: p.instagram!.trim().replace(/^@/, ""),
    picture: p.instagramPicture || p.picture || undefined, connection: p.instagramConnectionType,
  }));

export const listIgAccounts = async (c: Creds) => igAccountsFrom(await mc<Profile[]>(c, "/admin/simpleProfiles"));
