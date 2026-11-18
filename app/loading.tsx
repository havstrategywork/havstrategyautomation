// Shown by Next while a page's server data loads, so tab changes give instant feedback instead of a frozen screen.
export default function Loading() {
  return <div className="page-loading" role="status" aria-label="Loading"><div className="spinner" /></div>;
}
