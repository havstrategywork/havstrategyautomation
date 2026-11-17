import { db } from "./db";

export const RUN_TTL_MS = 20 * 60 * 1000; // a crashed run frees the lock after this...
export const LONG_RUN_TTL_MS = 60 * 60 * 1000; // ...except "briefs" runs (web hunting is slow), which hold it up to 60 min

export async function controlState() {
  const { control } = await db();
  return (await control.findOne({ _id: "state" })) ?? { _id: "state" as const };
}

/** Work-handing endpoints return nothing while paused, so a misbehaving run can't send even if it tries. */
export async function isPaused() {
  return (await controlState()).paused ?? null;
}
