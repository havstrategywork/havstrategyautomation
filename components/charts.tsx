// Number formatting for the social reports. (The old bar/line charts are in git history.)

const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const fmt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "—" : unit === "%" ? `${n.toFixed(1)}%` : Math.abs(n) >= 1000 ? nf.format(n) : String(Math.round(n * 10) / 10));
