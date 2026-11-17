// Money is stored as text: "10k INR", "1.5 lakh INR", "800 USD". A currency is mandatory, so a bare number is rejected.
import { tierOf } from "./fields.ts";
const CUR: Record<string, string> = { "₹": "INR", rs: "INR", "rs.": "INR", inr: "INR", aed: "AED", usd: "USD", $: "USD", "€": "EUR", eur: "EUR", gbp: "GBP", "£": "GBP" };
const MULT: Record<string, number> = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, m: 1e6 };
const C = "(₹|rs\\.?|inr|aed|usd|\\$|€|eur|£|gbp)";
const RE = new RegExp(`^\\s*${C}?\\s*([\\d,]*\\.?\\d+)\\s*(k|lakh|lac|l|m)?\\s*${C}?\\s*$`, "i");

export type Money = { amt: number; cur: string };

export function parseMoney(v: unknown): Money | null {
  const m = RE.exec(String(v ?? ""));
  const cur = m && CUR[(m[1] ?? m[4] ?? "").toLowerCase()];
  if (!m || !cur) return null;
  return { amt: Math.round(Number(m[2].replace(/,/g, "")) * (MULT[(m[3] ?? "").toLowerCase()] ?? 1)), cur };
}

/** Canonical text, e.g. "10k INR", "10,500 INR". */
export const fmtMoney = ({ amt, cur }: Money) => `${amt >= 1000 && amt % 1000 === 0 ? `${amt / 1000}k` : amt.toLocaleString("en-US")} ${cur}`;

/** Normalises user input to canonical text, or throws so a bad amount is never stored. */
export function cleanMoney(v: unknown, field = "amount") {
  const m = parseMoney(v);
  if (!m) throw new Error(`${field}: can't read "${v}". Use a number and currency, e.g. "10k INR".`);
  return fmtMoney(m);
}

/** null if `price` is within `ceiling`; otherwise the reason it isn't. A different currency is refused, never converted. */
export function overCeiling(price: Money, ceiling: Money) {
  if (price.cur !== ceiling.cur) return `must be stated in ${ceiling.cur}, not ${price.cur}`;
  return price.amt > ceiling.amt ? `${fmtMoney(price)} is above the budget` : null;
}

/** The budget for a creator: their tier's rate if the client set one (e.g. Nano "10k INR"), otherwise the client's general maxRate. */
export const capFor = (cl: { maxRate?: string; tierRates?: Record<string, string> }, followers: number) =>
  parseMoney(cl.tierRates?.[tierOf(followers)] ?? cl.maxRate);
