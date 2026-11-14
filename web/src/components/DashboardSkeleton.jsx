export default function DashboardSkeleton() {
  return <main className="app-shell skeleton-shell" aria-busy="true" aria-label="Loading dashboard">
    <header className="topbar"><div className="skeleton-block brand-skeleton"/><div className="skeleton-block status-skeleton"/></header>
    <section className="intro"><div><span className="skeleton-block eyebrow-skeleton"/><span className="skeleton-block title-skeleton"/><span className="skeleton-block subtitle-skeleton"/></div><div className="skeleton-block dataset-skeleton"/></section>
    <div className="skeleton-block metrics-skeleton"/><div className="skeleton-heading"><span className="skeleton-block eyebrow-skeleton"/><span className="skeleton-block subtitle-skeleton"/></div>
    <section className="workspace"><div className="skeleton-block table-skeleton"/><div className="right-column"><div className="skeleton-block graph-skeleton"/><div className="skeleton-block detail-skeleton"/></div></section>
    <p className="loading-caption"><span className="loader"/> Loading investigation data…</p>
  </main>;
}
