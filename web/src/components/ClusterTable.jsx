import { TYPOLOGY, money } from '../utils/clusterDisplay.js';
export function TypologyBadge({ value }) {
  const t = TYPOLOGY[value] ?? { label: value?.replaceAll('_', ' ') ?? 'Unknown', color: '#9aaaba' };
  return <span className="typology-badge" style={{ '--type-color': t.color }}><i/>{t.label}</span>;
}
const riskColor = score => score >= 85 ? '#ee7f73' : score >= 75 ? '#e8bd68' : '#72c2a0';

export default function ClusterTable({ clusters, totalClusters, typologies, query, typology, sort, ascending, onQueryChange, onTypologyChange, onSortChange, selectedId, onSelect }) {
  return <section className="cluster-card"><div className="table-header"><span>RANKED CLUSTERS <small>{clusters.length}/{totalClusters}</small></span><div className="sort-controls"><span>SORT</span>{[['risk','Risk'],['exposure','Exposure'],['accounts','Accounts']].map(([key,label]) => <button key={key} onClick={() => onSortChange(key)} aria-pressed={sort === key} aria-label={`Sort by ${label}${sort === key ? (ascending ? ' ascending' : ' descending') : ''}`}>{label}{sort === key ? (ascending ? ' ↑' : ' ↓') : ''}</button>)}</div></div>
    <div className="cluster-filters"><label className="sr-only" htmlFor="cluster-search">Search clusters by name, ID, or account</label><input id="cluster-search" type="search" placeholder="Search name, ID, or account…" value={query} onChange={event => onQueryChange(event.target.value)}/><label className="sr-only" htmlFor="typology-filter">Filter by typology</label><select id="typology-filter" value={typology} onChange={event => onTypologyChange(event.target.value)}><option value="all">All typologies</option>{typologies.map(t => <option key={t} value={t}>{TYPOLOGY[t]?.label ?? t.replaceAll('_', ' ')}</option>)}</select>{(query || typology !== 'all') && <button className="clear-filters" onClick={() => { onQueryChange(''); onTypologyChange('all'); }}>Clear filters</button>}</div>
    <div className="cluster-list">{clusters.map((c, index) => { const score = c.risk_score != null && Number.isFinite(Number(c.risk_score)) ? Number(c.risk_score) : null; return <button className={`cluster-row ${c.id === selectedId ? 'selected' : ''}`} key={c.id} onClick={() => onSelect(c.id)} aria-pressed={c.id === selectedId}>
      <div className="row-top"><span className="rank">{String(c.rank ?? index + 1).padStart(2, '0')}</span><span className="cluster-id">{c.id}</span><span className="risk-score" style={{ color: riskColor(score ?? 0) }}>{score ?? '—'}<small>/100</small></span></div>
      <div className="risk-track"><i style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%`, background: riskColor(score ?? 0) }}/></div>
      <div className="row-badge"><TypologyBadge value={c.typologies?.[0]}/><span>{c.accounts?.length ?? 0} ACCOUNTS</span></div>
      <div className="row-stats"><div><small>EXPOSURE</small><b>{money(c.total_amount)}</b></div><div><small>TIME SPAN</small><b>{c.time_span_hours ?? '—'}h</b></div></div>
    </button>; })}</div>{clusters.length === 0 && <div className="empty-state">{totalClusters ? 'No clusters match these search and filter settings.' : 'No suspicious clusters were found in this run.'}</div>}<div className="table-foot"><i/> Showing {clusters.length} of {totalClusters} · Select a cluster to inspect its network</div></section>;
}
