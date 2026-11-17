import Link from "next/link";
import {
  type PaginationProps,
  getPageNumbers,
  makePageUrl,
} from "@/lib/pagination";

export type { PaginationProps };
export { getPageNumbers, makePageUrl };

export default function Pagination({
  page,
  total,
  pageSize = 15,
  basePath,
  params = {},
  itemLabel = "items",
}: PaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1) {
    return (
      <div className="pagination">
        <div className="pagination-info">
          Showing all <b>{total}</b> {itemLabel}
        </div>
      </div>
    );
  }

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="pagination-info">
        Showing <b>{from}–{to}</b> of <b>{total}</b> {itemLabel}
      </div>

      <div className="pagination-nav">
        {currentPage > 1 ? (
          <Link
            href={makePageUrl(basePath, params, currentPage - 1)}
            className="pagination-btn"
            aria-label="Previous page"
          >
            ← Prev
          </Link>
        ) : (
          <span className="pagination-btn disabled" aria-disabled="true">
            ← Prev
          </span>
        )}

        {pages.map((p, idx) => {
          if (p === "...") {
            return (
              <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                …
              </span>
            );
          }
          const isCurrent = p === currentPage;
          return isCurrent ? (
            <span
              key={p}
              className="pagination-btn active"
              aria-current="page"
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={makePageUrl(basePath, params, p)}
              className="pagination-btn"
              aria-label={`Page ${p}`}
            >
              {p}
            </Link>
          );
        })}

        {currentPage < totalPages ? (
          <Link
            href={makePageUrl(basePath, params, currentPage + 1)}
            className="pagination-btn"
            aria-label="Next page"
          >
            Next →
          </Link>
        ) : (
          <span className="pagination-btn disabled" aria-disabled="true">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
