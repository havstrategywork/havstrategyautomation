/** Fills {{name}} / {{handle}} in the user's pasted message. Throws if any {{placeholder}} would be left in the text. */
export function render(template: string, vars: Record<string, string>) {
  const out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => vars[k] ?? m);
  const left = out.match(/\{\{\s*\w+\s*\}\}/g);
  if (left) throw new Error(`unfilled placeholder(s): ${left.join(", ")}`);
  return out;
}

export const firstName = (n: string) => n.trim().split(/\s+/)[0];
