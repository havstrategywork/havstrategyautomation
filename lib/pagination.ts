export interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  basePath: string;
  params?: Record<string, string | string[] | undefined>;
  itemLabel?: string;
}

export function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function makePageUrl(
  basePath: string,
  params: Record<string, string | string[] | undefined> = {},
  pageNum: number
) {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (key === "page") continue;
    if (val === undefined || val === null || val === "") continue;
    if (Array.isArray(val)) {
      for (const v of val) if (v) sp.append(key, v);
    } else {
      sp.set(key, val);
    }
  }
  if (pageNum > 1) {
    sp.set("page", String(pageNum));
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
