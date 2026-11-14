import { TYPOLOGY, RISK_BANDS, formatTimestamp, money, riskBand } from '../utils/clusterDisplay.js';

export function TypologyBadge({ value }) {
  const typology = TYPOLOGY[value] ?? { label: value?.replaceAll('_', ' ') ?? 'Unknown', color: '#9aaaba' };
  return <span className="typology-badge" style={{ '--type-color': typology.color }}><i/>{typology.label}</span>;
}

function periodLabel(period) {
  if (!period?.start || !period?.end) return 'Unavailable';
  const start = formatTimestamp(period.start);
  const end = formatTimestamp(period.end);
  return start === end ? start : `${start} — ${end}`;
}

export default function ClusterTable({
  clusters, totalClusters, typologies, query, typology, riskLevel, onRiskLevelChange,
  periodByCluster, sort, ascending, onQueryChange, onTypologyChange, onSortChange,
  selectedId, onSelect
}) {
  const filtersActive = Boolean(query) || typology !== 'all' || riskLevel !== 'all';
  const clearFilters = () => {
    onQueryChange('');
    onTypologyChange('all');
    onRiskLevelChange('all');
  };

  return <section className="cluster-card" aria-label="Suspicious alerts">
    <div className="table-header">
      <span>RISK-RANKED ALERTS <small>{clusters.length}/{totalClusters}</small></span>
      <div className="sort-controls"><span>SORT</span>{[['risk','Risk'],['exposure','Amount'],['accounts','Accounts']].map(([key,label]) => <button key={key} onClick={() => onSortChange(key)} aria-pressed={sort === key} aria-label={`Sort by ${label}${sort === key ? (ascending ? ' ascending' : ' descending') : ''}`}>{label}{sort === key ? (ascending ? ' ↑' : ' ↓') : ''}</button>)}</div>
    </div>
    <div className="cluster-filters">
      <label className="sr-only" htmlFor="cluster-search">Search alerts by ID or account</label>
      <input id="cluster-search" type="search" placeholder="Search alert ID or account…" value={query} onChange={event => onQueryChange(event.target.value)}/>
      <label className="sr-only" htmlFor="typology-filter">Filter alerts by typology</label>
      <select id="typology-filter" value={typology} onChange={event => onTypologyChange(event.target.value)}><option value="all">All typologies</option>{typologies.map(value => <option key={value} value={value}>{TYPOLOGY[value]?.label ?? value.replaceAll('_', ' ')}</option>)}</select>
      <label className="sr-only" htmlFor="risk-filter">Filter alerts by risk level</label>
      <select id="risk-filter" value={riskLevel} onChange={event => onRiskLevelChange(event.target.value)}><option value="all">All risk levels</option>{RISK_BANDS.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}</select>
      {filtersActive && <button className="clear-filters" onClick={clearFilters}>Clear filters</button>}
    </div>
    <div className="cluster-list">
      {clusters.map((cluster, index) => {
        const score = cluster.risk_score != null && Number.isFinite(Number(cluster.risk_score)) ? Number(cluster.risk_score) : null;
        const band = riskBand(score);
        const clusterTypes = Array.isArray(cluster.typologies) ? cluster.typologies : [];
        const typologyColor = TYPOLOGY[clusterTypes[0]]?.color ?? '#68bdb2';
        const accountCount = Array.isArray(cluster.accounts) ? cluster.accounts.length : 0;
        const transactionCount = Array.isArray(cluster.transaction_ids) ? cluster.transaction_ids.length : 0;
        return <button className={`cluster-row alert-row ${cluster.id === selectedId ? 'selected' : ''}`} style={{ '--cluster-color': typologyColor }} key={cluster.id} onClick={() => onSelect(cluster.id)} aria-pressed={cluster.id === selectedId}>
          <div className="row-top"><span className="rank">{String(cluster.rank ?? index + 1).padStart(2, '0')}</span><span className="cluster-id"><small>CLUSTER</small> {cluster.id}</span><span className={`severity-badge ${band?.id ?? 'unavailable'}`} title={score == null ? 'Risk severity unavailable' : 'Severity band derived from the backend risk score'} style={band ? { '--severity-color': band.color } : undefined}>{band?.label ?? 'Unavailable'}</span><span className="risk-score" style={{ color: band?.color ?? 'var(--muted)' }}>{score ?? '—'}<small>/100</small></span></div>
          <div className="risk-track"><i style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%`, background: band?.color ?? '#52636a' }}/></div>
          <div className="alert-typologies">{clusterTypes.length ? clusterTypes.map(value => <TypologyBadge key={value} value={value}/>) : <span className="muted compact">Typology unavailable</span>}</div>
          <div className="alert-data-grid"><div><small>TRANSACTION AMOUNT</small><b>{money(cluster.total_amount)}</b></div><div><small>ACCOUNTS / TRANSFERS</small><b>{accountCount} / {transactionCount}</b></div><div className="alert-period"><small>TRANSACTION PERIOD</small><b>{periodLabel(periodByCluster?.[cluster.id])}</b></div></div>
        </button>;
      })}
    </div>
    {clusters.length === 0 && <div className="empty-state">{totalClusters ? 'No alerts match these search and filter settings.' : 'No suspicious alerts were returned by the detection run.'}</div>}
    <div className="table-foot"><i/> Showing {clusters.length} of {totalClusters} · Select an alert to investigate</div>
  </section>;
}
