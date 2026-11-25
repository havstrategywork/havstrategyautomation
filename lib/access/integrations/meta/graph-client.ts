/** Thin fetch wrapper for the Meta Graph API. No SDK - Meta's Graph API is plain REST/JSON. */

export function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
}

export interface GraphResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Meta's own error subcode, when present - useful to distinguish "denied" from "expired" from "insufficient scope". */
  errorCode?: number;
}

export async function graphGet<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      return { ok: false, error: json?.error?.message ?? `Graph API returned ${res.status}`, errorCode: json?.error?.code };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Graph API request failed." };
  }
}

export async function graphDelete<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const res = await fetch(url.toString(), { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return { ok: false, error: json?.error?.message ?? `Graph API returned ${res.status}` };
    return { ok: true, data: json as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Graph API request failed." };
  }
}

export async function graphPost<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = `https://graph.facebook.com/${graphVersion()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return { ok: false, error: json?.error?.message ?? `Graph API returned ${res.status}`, errorCode: json?.error?.code };
    return { ok: true, data: json as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Graph API request failed." };
  }
}

export function requireMetaConfig(): { ok: true; appId: string; appSecret: string } | { ok: false; error: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, error: "Meta integration is not configured (META_APP_ID / META_APP_SECRET missing)." };
  }
  return { ok: true, appId, appSecret };
}
