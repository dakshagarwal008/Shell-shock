export const TYPOLOGY = {
  fan_out_dispersion: { label: 'Fan-out dispersion', color: '#ef9c66', short: 'DISPERSION' },
  fan_in_aggregation: { label: 'Fan-in aggregation', color: '#70b8da', short: 'AGGREGATION' },
  cyclic_round_tripping: { label: 'Round-tripping cycle', color: '#bc9cf4', short: 'ROUND-TRIPPING' },
  rapid_pass_through: { label: 'Rapid pass-through', color: '#e9c36b', short: 'PASS-THROUGH' }
};
export const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export function TypologyBadge({ value }) {
  const t = TYPOLOGY[value] ?? { label: value?.replaceAll('_',' ') ?? 'Unknown', color:'#9aaaba' };
  return <span className="typology-badge" style={{'--type-color':t.color}}><i/>{t.label}</span>;
}
const riskColor = score => score >= 85 ? '#ee7f73' : score >= 75 ? '#e8bd68' : '#72c2a0';

export default function ClusterTable({ clusters, selectedId, onSelect }) {
  return <section className="cluster-card"><div className="table-header"><span>RANKED CLUSTERS</span><span>HIGHER RISK ↑</span></div><div className="cluster-list">{clusters.map((c, index) => <button className={`cluster-row ${c.id === selectedId ? 'selected' : ''}`} key={c.id} onClick={() => onSelect(c.id)} aria-pressed={c.id === selectedId}>
    <div className="row-top"><span className="rank">{String(c.rank ?? index + 1).padStart(2,'0')}</span><span className="cluster-id">{c.id}</span><span className="risk-score" style={{color:riskColor(c.risk_score)}}>{c.risk_score}<small>/100</small></span></div>
    <div className="risk-track"><i style={{width:`${Math.max(0,Math.min(100,c.risk_score))}%`,background:riskColor(c.risk_score)}}/></div>
    <div className="row-badge"><TypologyBadge value={c.typologies?.[0]}/><span>{c.accounts?.length ?? 0} ACCOUNTS</span></div>
    <div className="row-stats"><div><small>EXPOSURE</small><b>{money(c.total_amount)}</b></div><div><small>TIME SPAN</small><b>{c.time_span_hours ?? '—'}h</b></div></div>
  </button>)}</div>{clusters.length === 0 && <div className="empty-state">No suspicious clusters were found in this run.</div>}<div className="table-foot"><i/> Select a cluster to inspect its network</div></section>;
}
