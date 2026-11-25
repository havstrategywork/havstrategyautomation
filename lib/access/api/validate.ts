import { NextResponse } from "next/server";
import type { z } from "zod";

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Validation failed.", details: result.error.flatten() }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<T>(
  url: URL,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Validation failed.", details: result.error.flatten() }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}
